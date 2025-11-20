// src/services/conversation.service.js
/**
 * Conversation engine (final)
 * - supports booking for self or other
 * - creates new family member on-the-fly
 * - asks relationship and stores normalized lowercase (option B)
 * - assumes name provided is correct (option A)
 *
 * Exports: processIncoming({ clinicId, from, msg, text })
 * Returns: array of message payloads in Meta Cloud format, e.g. { type: 'text', text: { body: '...' } }
 *
 * Dependencies:
 *  - db (pool + query)
 *  - patientService (findOrCreateByPhone)
 *  - scheduleService (generateAvailableSlots)
 *  - appointmentService (createAppointment)
 */

const db = require("../db");
const patientService = require("./patient.service");
const scheduleService = require("./doctor-schedule.service");
const appointmentService = require("./appointment.service");

// small helper for message objects
function textMessage(body) {
  return { type: "text", text: { body } };
}

function normalizeRelationship(raw) {
  if (!raw) return "family_member";
  const t = raw.trim().toLowerCase();
  // allow common tokens and normalize
  if (/son|boy|child/i.test(t)) return "son";
  if (/daughter|girl/i.test(t)) return "daughter";
  if (/wife|spouse|partner/i.test(t)) return "wife";
  if (/husband/i.test(t)) return "husband";
  if (/mother|mom|mum/i.test(t)) return "mother";
  if (/father|dad|pa/i.test(t)) return "father";
  return "other";
}

/* ----------------
   Session helpers
   ---------------- */
async function getOrCreateSession(clinicId, phone) {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const sel = await client.query(
      `SELECT * FROM whatsapp_sessions WHERE clinic_id=$1 AND phone=$2 FOR UPDATE`,
      [clinicId, phone]
    );
    if (sel.rows.length) {
      const row = sel.rows[0];
      await client.query(`UPDATE whatsapp_sessions SET last_interaction_at = now() WHERE session_id=$1`, [row.session_id]);
      await client.query("COMMIT");
      row.context = row.context || {};
      return row;
    }
    const ins = await client.query(
      `INSERT INTO whatsapp_sessions (clinic_id, phone, state, context) VALUES ($1, $2, 'idle', '{}'::jsonb) RETURNING *`,
      [clinicId, phone]
    );
    await client.query("COMMIT");
    const row = ins.rows[0];
    row.context = row.context || {};
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateSession(clinicId, phone, { state, context }) {
  const sql = `UPDATE whatsapp_sessions SET state=$1, context=$2, last_interaction_at=now() WHERE clinic_id=$3 AND phone=$4 RETURNING *`;
  const { rows } = await db.query(sql, [state, context || {}, clinicId, phone]);
  return rows[0];
}

async function resetSession(clinicId, phone) {
  await db.query(`UPDATE whatsapp_sessions SET state='idle', context='{}' WHERE clinic_id=$1 AND phone=$2`, [clinicId, phone]);
}

/* ----------------
   Intent detection
   ---------------- */
function detectIntentAndFlags(text) {
  if (!text) return { intent: null, forOther: false };
  const t = text.toLowerCase();
  const booking = /(book|appointment|consult|visit|slot|schedule|see doctor)/.test(t);
  const cancel = /(cancel|resched|reschedule)/.test(t);
  const greeting = /(hi|hello|hey)/.test(t);
  const forOther = /(someone else|other person|for my|for the|book for my|book for someone|i want to book for|for my daughter|for my son|for my wife|for my husband|for my mother|for my father)/.test(t);
  if (booking) return { intent: "booking", forOther };
  if (cancel) return { intent: "cancel", forOther: false };
  if (greeting) return { intent: "greeting", forOther: false };
  return { intent: null, forOther: false };
}

/* ----------------
   Fetch clinic doctors list
   ---------------- */
async function fetchDoctorsSimple(clinicId, limit = 8) {
  const sql = `
    SELECT d.doctor_id, u.full_name, d.specialization
    FROM doctors d
    JOIN app_users u ON u.user_id = d.user_id
    WHERE d.clinic_id = $1 AND COALESCE(d.is_active, true)
    ORDER BY d.doctor_id
    LIMIT $2
  `;
  const { rows } = await db.query(sql, [clinicId, limit]);
  return rows.map(r => ({ doctor_id: r.doctor_id, full_name: r.full_name, specialization: r.specialization }));
}

/* ----------------
   Slot formatting helper
   ---------------- */
function makeSlotsText(slots) {
  // slots: array returned from scheduleService.generateAvailableSlots
  if (!slots || !slots.length) return "No slots available.";
  let body = "Available slots:\n";
  slots.forEach((s, i) => {
    const local = new Date(s.slot_start_local).toLocaleString();
    body += `${i + 1}) ${local}\n`;
  });
  body += "\nReply with the slot number to book, or reply 'another date' to pick a different date.";
  return body;
}

/* ----------------
   Main entry
   ---------------- */
exports.processIncoming = async ({ clinicId, from, msg, text }) => {
  // from: sender phone (string), clinicId: number
  const session = await getOrCreateSession(clinicId, from);
  const state = session.state || "idle";
  const context = session.context || {};

  const replies = []; // array of message payloads to return

  // Detect intent flags for quick paths
  const { intent, forOther } = detectIntentAndFlags(text);

  // State machine
  // 1) IDLE: look for booking trigger
  if (state === "idle") {
    if (intent === "booking") {
      // lookup contacts for this phone in this clinic
      const findSql = `
        SELECT p.patient_id, p.full_name
        FROM patient_contacts pc
        JOIN patients p ON p.patient_id = pc.patient_id
        WHERE pc.clinic_id = $1 AND pc.phone = $2 AND p.deleted_at IS NULL
        ORDER BY pc.is_primary DESC NULLS LAST, p.patient_id DESC
      `;
      const found = await db.query(findSql, [clinicId, from]);

      if (forOther) {
        // user explicitly said "for someone else" - go to flow to collect name + relationship
        await updateSession(clinicId, from, { state: "ask_family_member_name", context: {} });
        replies.push(textMessage("Okay — who is the appointment for? Please provide the full name of the patient (e.g., 'Sara Khan')."));
        return replies;
      }

      if (found.rowCount === 0) {
        // no contact -> ask whether booking for self or someone else
        await updateSession(clinicId, from, { state: "ask_patient_or_other", context: {} });
        replies.push(textMessage("I couldn't find your profile. Is this appointment for:\n1) Me\n2) Someone else\n\nReply with 1 or 2"));
        return replies;
      }

      if (found.rowCount === 1) {
        // single patient linked -> ask whether booking for self or someone else (we give choice)
        const p = found.rows[0];
        context.patient_id = p.patient_id;
        await updateSession(clinicId, from, { state: "ask_patient_or_other", context });
        replies.push(textMessage(`I found your profile as ${p.full_name}. Is this appointment for:\n1) ${p.full_name} (me)\n2) Someone else\n\nReply with 1 or 2`));
        return replies;
      }

      // multiple candidate patients
      const candidates = found.rows.map(r => ({ patient_id: r.patient_id, full_name: r.full_name }));
      context.patient_candidates = candidates;
      await updateSession(clinicId, from, { state: "ask_existing_patient_choice", context });
      let body = "I found multiple people linked to this number. Who is this appointment for?\n";
      candidates.forEach((c, i) => { body += `${i + 1}) ${c.full_name}\n`; });
      body += `${candidates.length + 1}) Someone else\n\nReply with the number.`;
      replies.push(textMessage(body));
      return replies;
    }

    // Not a booking
    replies.push(textMessage("Hi! I can help you book doctor appointments. Reply 'book' or 'appointment' to get started."));
    return replies;
  }

  // 2) ask_patient_or_other - user chooses 1 (me) or 2 (someone else)
  if (state === "ask_patient_or_other") {
    const choice = parseInt((text || "").trim(), 10);
    if (choice === 1) {
      // booking for self; ensure patient_id in context
      if (!context.patient_id) {
        // if no patient_id we must create one (phone not found scenario) — ask for name
        await updateSession(clinicId, from, { state: "ask_family_member_name", context: {} });
        replies.push(textMessage("Okay — please tell me your full name so I can create your profile."));
        return replies;
      }
      // else move to doctor selection
      const doctors = await fetchDoctorsSimple(clinicId);
      context.doctors = doctors;
      await updateSession(clinicId, from, { state: "ask_doctor", context });
      replies.push(textMessage("Who would you like to see? Reply with the number:"));
      let list = "";
      doctors.forEach((d, i) => { list += `${i + 1}) Dr ${d.full_name} — ${d.specialization || "General"}\n`; });
      replies.push(textMessage(list));
      return replies;
    }
    if (choice === 2) {
      // user chooses someone else -> ask name
      await updateSession(clinicId, from, { state: "ask_family_member_name", context: {} });
      replies.push(textMessage("Sure — what is the patient's full name?"));
      return replies;
    }
    replies.push(textMessage("Please reply with 1 (Me) or 2 (Someone else)."));
    return replies;
  }

  // 3) ask_existing_patient_choice - user picks one existing or "someone else"
  if (state === "ask_existing_patient_choice") {
    const candidates = context.patient_candidates || [];
    const idx = parseInt((text || "").trim(), 10);
    if (!idx || idx < 1 || idx > candidates.length + 1) {
      replies.push(textMessage("Please reply with a valid number from the options."));
      return replies;
    }
    if (idx === candidates.length + 1) {
      // someone else
      await updateSession(clinicId, from, { state: "ask_family_member_name", context: {} });
      replies.push(textMessage("Okay — what's the full name of the patient?"));
      return replies;
    }
    // chosen existing patient
    const chosen = candidates[idx - 1];
    context.patient_id = chosen.patient_id;
    const doctors = await fetchDoctorsSimple(clinicId);
    context.doctors = doctors;
    await updateSession(clinicId, from, { state: "ask_doctor", context });
    replies.push(textMessage(`Booking for ${chosen.full_name}. Which doctor would you like? Reply with the number:`));
    let list = "";
    doctors.forEach((d, i) => { list += `${i + 1}) Dr ${d.full_name} — ${d.specialization || "General"}\n`; });
    replies.push(textMessage(list));
    return replies;
  }

  // 4) ask_family_member_name - collect new patient full name (we assume correct)
  if (state === "ask_family_member_name") {
    const fullName = (text || "").trim();
    if (!fullName) {
      replies.push(textMessage("Please provide the full name (e.g., 'Sara Khan')."));
      return replies;
    }
    // store name in context and ask relationship
    context.pending_family_name = fullName;
    await updateSession(clinicId, from, { state: "ask_family_relationship", context });
    replies.push(textMessage("What's their relationship to you? Reply with number:\n1) Son\n2) Daughter\n3) Wife\n4) Husband\n5) Mother\n6) Father\n7) Other"));
    return replies;
  }

  // 5) ask_family_relationship - user selects a relationship; we create patient+contact then proceed
  if (state === "ask_family_relationship") {
    const mapping = {
      1: "son", 2: "daughter", 3: "wife", 4: "husband", 5: "mother", 6: "father", 7: "other"
    };
    const idx = parseInt((text || "").trim(), 10);
    if (!idx || idx < 1 || idx > 7) {
      replies.push(textMessage("Please reply with a number between 1 and 7 for the relationship."));
      return replies;
    }
    const rel = mapping[idx];
    const normalized = rel.toLowerCase(); // Option B
    // create patient + contact in patientService
    try {
      const result = await patientService.findOrCreateByPhone({
        clinicId,
        phone: from,
        full_name: context.pending_family_name,
        relationship: normalized
      });
      // result.created indicates if new created; pick first returned
      const createdPatient = result.patients[0];
      context.patient_id = createdPatient.patient_id;
      // cleanup pending fields
      delete context.pending_family_name;
      // proceed to doctor selection
      const doctors = await fetchDoctorsSimple(clinicId);
      context.doctors = doctors;
      await updateSession(clinicId, from, { state: "ask_doctor", context });
      replies.push(textMessage(`Got it. ${createdPatient.full_name} added as ${normalized}. Which doctor would you like? Reply with the number:`));
      let list = "";
      doctors.forEach((d, i) => { list += `${i + 1}) Dr ${d.full_name} — ${d.specialization || "General"}\n`; });
      replies.push(textMessage(list));
      return replies;
    } catch (err) {
      // creation failed
      await updateSession(clinicId, from, { state: "idle", context: {} });
      replies.push(textMessage("Sorry, I couldn't create the patient record. Please try again later or contact the clinic."));
      return replies;
    }
  }

  // 6) ask_doctor - user chooses doctor by number
  if (state === "ask_doctor") {
    const doctors = context.doctors || (await fetchDoctorsSimple(clinicId));
    const idx = parseInt((text || "").trim(), 10);
    if (!idx || idx < 1 || idx > doctors.length) {
      replies.push(textMessage("Please reply with a valid doctor number from the list."));
      return replies;
    }
    const chosenDoc = doctors[idx - 1];
    context.doctor_id = chosenDoc.doctor_id;
    await updateSession(clinicId, from, { state: "ask_date", context });
    replies.push(textMessage(`You chose Dr ${chosenDoc.full_name}. Which date would you like? Reply with YYYY-MM-DD or say 'tomorrow'.`));
    return replies;
  }

  // 7) ask_date - parse simple date input, then fetch slots
  if (state === "ask_date") {
    let dateStr = null;
    const t = (text || "").trim().toLowerCase();
    if (t === "today") {
      dateStr = new Date().toISOString().slice(0, 10);
    } else if (t === "tomorrow") {
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      dateStr = dt.toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      dateStr = t;
    } else {
      replies.push(textMessage("Please reply with a date in YYYY-MM-DD format (e.g., 2025-11-19), or say 'tomorrow'."));
      return replies;
    }

    context.selected_date = dateStr;
    // call scheduleService to get slots
    const slotsArr = await scheduleService.generateAvailableSlots(clinicId, context.doctor_id, dateStr);
    if (!slotsArr.length) {
      replies.push(textMessage("No available slots on that date. Reply with another date or say 'next day'."));
      // stay in ask_date state
      await updateSession(clinicId, from, { state: "ask_date", context });
      return replies;
    }
    context.slots = slotsArr;
    await updateSession(clinicId, from, { state: "ask_slot", context });
    replies.push(textMessage(`Available slots on ${dateStr}:`));
    replies.push(textMessage(makeSlotsListText(slotsArr)));
    return replies;
  }

  // 8) ask_slot - user picks a slot number; create appointment
  if (state === "ask_slot") {
    const slots = context.slots || [];
    const idx = parseInt((text || "").trim(), 10);
    if (!idx || idx < 1 || idx > slots.length) {
      replies.push(textMessage("Please reply with a valid slot number from the list."));
      return replies;
    }
    const slot = slots[idx - 1];
    // create appointment (appointmentService validates)
    try {
      const created = await appointmentService.createAppointment({
        clinicId,
        doctor_id: context.doctor_id,
        patient_id: context.patient_id,
        start: slot.slot_start_local,
        end: slot.slot_end_local,
        mode: "offline",
        source: "whatsapp",
        notes: "Booked via WhatsApp",
        createdBy: null
      });
      await updateSession(clinicId, from, { state: "done", context });
      replies.push(textMessage(`✅ Appointment confirmed for ${new Date(slot.slot_start_local).toLocaleString()}. Reference ID: ${created.appointment_id}`));
      // optionally: send a templated confirmation using message_templates table
      return replies;
    } catch (err) {
      // likely overlapping due to race - ask to pick another slot or date
      const fresh = await scheduleService.generateAvailableSlots(clinicId, context.doctor_id, context.selected_date);
      context.slots = fresh;
      await updateSession(clinicId, from, { state: "ask_slot", context });
      if (!fresh.length) {
        replies.push(textMessage("Sorry, that slot was just taken and there are no more slots on that date. Would you like another date?"));
      } else {
        replies.push(textMessage("Sorry, that slot was just taken. Here are the remaining slots:"));
        replies.push(textMessage(makeSlotsListText(fresh)));
      }
      return replies;
    }
  }

  // default fallback reset
  await resetSession(clinicId, from);
  replies.push(textMessage("Sorry, I didn't understand. Reply 'book' to start a new appointment."));
  return replies;
};

/* Helper used in above - create a nicely numbered slots list */
function makeSlotsListText(slots) {
  if (!slots || !slots.length) return "No slots available.";
  let out = "";
  slots.forEach((s, i) => {
    out += `${i + 1}) ${new Date(s.slot_start_local).toLocaleString()}\n`;
  });
  out += "\nReply with the slot number to book.";
  return out;
}
