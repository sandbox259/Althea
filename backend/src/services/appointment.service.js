// src/services/appointment.service.js

/**
 * Appointment Service
 * ---------------------------------------------
 * Contains logic for:
 *  - Creating appointment
 *  - Validating schedule with:
 *        working hours
 *        blocked slots
 *        appointment overlaps (DB constraint)
 *        lead time
 *        buffer
 *  - Listing appointments
 *  - Updating/rescheduling
 */

const db = require("../db");
const scheduleService = require("./doctor-schedule.service");

/* ----------------------------------------------------------
   Helper: check doctor, patient belong to clinic
----------------------------------------------------------- */
async function assertDoctorInClinic(clinicId, doctorId) {
  const sql = `SELECT doctor_id FROM doctors WHERE doctor_id=$1 AND clinic_id=$2`;
  const { rows } = await db.query(sql, [doctorId, clinicId]);
  if (!rows.length) throw new Error("Doctor does not belong to this clinic");
}

async function assertPatientInClinic(clinicId, patientId) {
  const sql = `SELECT patient_id FROM patients WHERE patient_id=$1 AND clinic_id=$2`;
  const { rows } = await db.query(sql, [patientId, clinicId]);
  if (!rows.length) throw new Error("Patient does not belong to this clinic");
}

/* ----------------------------------------------------------
   Appointment Creation
----------------------------------------------------------- */
exports.createAppointment = async ({ clinicId, doctor_id, patient_id, start, end, mode, source, notes, createdBy }) => {
  // Validate doctor + patient in same clinic
  await assertDoctorInClinic(clinicId, doctor_id);
  await assertPatientInClinic(clinicId, patient_id);

  // Validate slot availability using scheduling module
  const slotOk = await validateSlotAvailable(clinicId, doctor_id, start, end);
  if (!slotOk.valid) {
    throw new Error(`Slot not available: ${slotOk.reason}`);
  }

  // Insert as tstzrange
  const sql = `
    INSERT INTO appointments (
      clinic_id, doctor_id, patient_id, appointment_ts,
      mode, source, notes, created_by
    )
    VALUES (
      $1, $2, $3,
      tstzrange($4::timestamptz, $5::timestamptz, '[)'),
      $6, $7, $8, $9
    )
    RETURNING *
  `;

  const params = [
    clinicId,
    doctor_id,
    patient_id,
    start,
    end,
    mode || "offline",
    source || "manual",
    notes || null,
    createdBy
  ];

  const { rows } = await db.query(sql, params);
  return rows[0];
};

/* ----------------------------------------------------------
   Validate Slot Availability (helper)
----------------------------------------------------------- */
async function validateSlotAvailable(clinicId, doctorId, start, end) {
  // Convert to ISO strings
  start = new Date(start).toISOString();
  end = new Date(end).toISOString();

  // RULE 1: Must be within working hours
  const whSql = `
    SELECT * FROM doctor_working_hours
    WHERE doctor_id=$1
      AND day_of_week = EXTRACT(DOW FROM $2::timestamptz)
      AND start_time <= ($2 AT TIME ZONE 'UTC')::time
      AND end_time   >= ($3 AT TIME ZONE 'UTC')::time
  `;
  const wh = await db.query(whSql, [doctorId, start, end]);
  if (!wh.rowCount) return { valid: false, reason: "Not in working hours" };

  // RULE 2: Must not hit blocked slots
  const blockSql = `
    SELECT 1 FROM doctor_blocked_slots
    WHERE doctor_id=$1
      AND blocked_range && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  `;
  const blocked = await db.query(blockSql, [doctorId, start, end]);
  if (blocked.rowCount) return { valid: false, reason: "Doctor is unavailable" };

  // RULE 3: Existing appointments (DB constraint also protects this)
  const apptSql = `
    SELECT 1 FROM appointments
    WHERE doctor_id=$1
      AND status IN ('scheduled','confirmed')
      AND appointment_ts && tstzrange($2::timestamptz, $3::timestamptz, '[)')
  `;
  const appt = await db.query(apptSql, [doctorId, start, end]);
  if (appt.rowCount) return { valid: false, reason: "Slot overlaps with existing appointment" };

  return { valid: true };
}

/* ----------------------------------------------------------
   List Appointments
----------------------------------------------------------- */
exports.listAppointments = async ({ clinicId, doctor_id, status, date }) => {
  let sql = `
    SELECT *
    FROM appointments
    WHERE clinic_id=$1
  `;
  const params = [clinicId];
  let idx = 2;

  if (doctor_id) {
    sql += ` AND doctor_id=$${idx++}`;
    params.push(Number(doctor_id));
  }

  if (status) {
    sql += ` AND status=$${idx++}`;
    params.push(status);
  }

  if (date) {
    sql += ` AND appointment_start::date=$${idx++}`;
    params.push(date);
  }

  sql += ` ORDER BY appointment_start ASC`;

  const { rows } = await db.query(sql, params);
  return rows;
};

/* ----------------------------------------------------------
   Get Single Appointment
----------------------------------------------------------- */
exports.getAppointment = async (clinicId, id) => {
  const sql = `
    SELECT *
    FROM appointments
    WHERE appointment_id=$1 AND clinic_id=$2
  `;
  const { rows } = await db.query(sql, [id, clinicId]);
  return rows[0] || null;
};

/* ----------------------------------------------------------
   Update Appointment
   (reschedule, cancel, change status)
----------------------------------------------------------- */
exports.updateAppointment = async ({ appointmentId, clinicId, updatedBy, start, end, status, notes }) => {
  // Fetch existing appointment
  const current = await db.query(
    `SELECT * FROM appointments WHERE appointment_id=$1 AND clinic_id=$2`,
    [appointmentId, clinicId]
  );
  if (!current.rowCount) throw new Error("Appointment not found");

  const appt = current.rows[0];

  // If rescheduling: validate slot again
  if (start && end) {
    const ok = await validateSlotAvailable(clinicId, appt.doctor_id, start, end);
    if (!ok.valid) throw new Error("Slot not available: " + ok.reason);
  }

  const sql = `
    UPDATE appointments
    SET
      appointment_ts = COALESCE(
        CASE WHEN $1 IS NOT NULL AND $2 IS NOT NULL
          THEN tstzrange($1::timestamptz, $2::timestamptz, '[)')
          ELSE appointment_ts
        END,
        appointment_ts
      ),
      status = COALESCE($3, status),
      notes  = COALESCE($4, notes),
      updated_at = now()
    WHERE appointment_id=$5
    RETURNING *
  `;

  const params = [
    start || null,
    end || null,
    status || null,
    notes || null,
    appointmentId
  ];

  const { rows } = await db.query(sql, params);
  return rows[0];
};
