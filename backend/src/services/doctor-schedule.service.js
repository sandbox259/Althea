// src/services/doctor-schedule.service.js

/**
 * Doctor Scheduling Service
 *
 * Responsibilities:
 *  - Ensure doctor belongs to the clinic
 *  - CRUD doctor_settings
 *  - CRUD doctor_working_hours
 *  - CRUD doctor_blocked_slots
 *  - Generate available slots for a given date
 *
 * Implementation notes:
 *  - We use Postgres' `generate_series()` to build candidate slots, then filter
 *    out slots that overlap blocked slots or appointments (considering buffer).
 *  - Timezone handling: we use clinic.timezone and construct timestamptz by casting
 *    (date + time) and applying AT TIME ZONE clinic.timezone so slots are generated
 *    in the clinic's local time.
 */

const db = require("../db");

/**
 * Helper: assertDoctorInClinic
 * - Ensures doctor exists and belongs to the clinic
 * - Throws Error if not found (controller wraps it)
 */
async function assertDoctorInClinic(clinicId, doctorId) {
  const sql = `SELECT doctor_id FROM doctors WHERE doctor_id=$1 AND clinic_id=$2 AND deleted_at IS NULL`;
  const { rows } = await db.query(sql, [doctorId, clinicId]);
  if (rows.length === 0) throw new Error("Doctor not found in this clinic");
}

/* ----------------------
   Settings (doctor_settings)
   ---------------------- */
exports.getSettings = async (clinicId, doctorId) => {
  await assertDoctorInClinic(clinicId, doctorId);
  const sql = `SELECT * FROM doctor_settings WHERE doctor_id=$1`;
  const { rows } = await db.query(sql, [doctorId]);
  return rows[0] || null;
};

exports.updateSettings = async (clinicId, doctorId, updates) => {
  await assertDoctorInClinic(clinicId, doctorId);

  // Upsert using ON CONFLICT (doctor_id)
  const sql = `
    INSERT INTO doctor_settings (doctor_id, slot_minutes, lead_time_min, buffer_min)
    VALUES ($1, COALESCE($2, 15), COALESCE($3, 60), COALESCE($4, 0))
    ON CONFLICT (doctor_id)
    DO UPDATE SET
      slot_minutes = COALESCE($2, doctor_settings.slot_minutes),
      lead_time_min = COALESCE($3, doctor_settings.lead_time_min),
      buffer_min = COALESCE($4, doctor_settings.buffer_min)
    RETURNING *
  `;
  const params = [
    doctorId,
    updates.slot_minutes || null,
    updates.lead_time_min || null,
    updates.buffer_min || null
  ];
  const { rows } = await db.query(sql, params);
  return rows[0];
};

/* ----------------------
   Working hours CRUD (doctor_working_hours)
   ---------------------- */
exports.getWorkingHours = async (clinicId, doctorId) => {
  await assertDoctorInClinic(clinicId, doctorId);

  const sql = `
    SELECT id, doctor_id, day_of_week, start_time, end_time
    FROM doctor_working_hours
    WHERE doctor_id = $1
    ORDER BY day_of_week, start_time
  `;
  const { rows } = await db.query(sql, [doctorId]);
  return rows;
};

exports.addWorkingHour = async (clinicId, doctorId, { day_of_week, start_time, end_time }) => {
  await assertDoctorInClinic(clinicId, doctorId);

  // Insert safe — unique constraint on (doctor_id, day_of_week, start_time, end_time) will prevent duplicates
  const sql = `
    INSERT INTO doctor_working_hours (doctor_id, day_of_week, start_time, end_time)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const { rows } = await db.query(sql, [doctorId, day_of_week, start_time, end_time]);
  return rows[0];
};

exports.deleteWorkingHour = async (clinicId, doctorId, id) => {
  await assertDoctorInClinic(clinicId, doctorId);

  const sql = `DELETE FROM doctor_working_hours WHERE id=$1 AND doctor_id=$2`;
  await db.query(sql, [id, doctorId]);
  return;
};

/* ----------------------
   Blocked slots CRUD (doctor_blocked_slots)
   ---------------------- */
exports.listBlockedSlots = async (clinicId, doctorId) => {
  await assertDoctorInClinic(clinicId, doctorId);

  const sql = `
    SELECT id, doctor_id, reason, blocked_range, created_at
    FROM doctor_blocked_slots
    WHERE doctor_id = $1
    ORDER BY created_at DESC
  `;
  const { rows } = await db.query(sql, [doctorId]);
  return rows;
};

exports.createBlockedSlot = async (clinicId, doctorId, { start, end, reason }) => {
  await assertDoctorInClinic(clinicId, doctorId);

  // blocked_range is tstzrange [start,end)
  const sql = `
    INSERT INTO doctor_blocked_slots (doctor_id, reason, blocked_range)
    VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'))
    RETURNING *
  `;
  const { rows } = await db.query(sql, [doctorId, reason || null, start, end]);
  return rows[0];
};

exports.deleteBlockedSlot = async (clinicId, doctorId, id) => {
  await assertDoctorInClinic(clinicId, doctorId);
  const sql = `DELETE FROM doctor_blocked_slots WHERE id=$1 AND doctor_id=$2`;
  await db.query(sql, [id, doctorId]);
  return;
};

/* ----------------------
   Generate available slots (core)
   ---------------------- */
/**
 * generateAvailableSlots(clinicId, doctorId, date)
 *
 * - clinicId: required (tenantScope ensures this)
 * - doctorId: required
 * - date: optional, ISO date-like '2025-11-19'; if null => use current date in clinic timezone
 *
 * Algorithm (implemented in SQL):
 * 1) Read clinic.timezone, doctor_settings (slot_minutes, lead_time_min, buffer_min)
 * 2) For the given date, select working_hours rows for the weekday
 * 3) For each working_hours row, build a generate_series() of candidate slot_start timestamptz values:
 *      FROM  ( (date + start_time) AT TIME ZONE clinic.timezone )
 *      TO    ( (date + end_time)   AT TIME ZONE clinic.timezone ) - slot_minutes
 *      STEP  slot_minutes
 * 4) For each candidate slot_start:
 *    - Compute slot_end = slot_start + interval 'slot_minutes minutes'
 *    - Enforce slot_start >= now() + lead_time_min
 *    - Ensure NOT EXISTS blocked_slots that overlap [slot_start, slot_end)
 *    - Ensure NOT EXISTS appointments for same doctor that overlap the slot expanded by buffer:
 *           appointment_ts && tstzrange(slot_start - buffer_min, slot_end + buffer_min)
 *    - Return slot_start and slot_end as ISO strings
 *
 * Note: This single SQL returns only truly available slots for the date in clinic timezone.
 */
exports.generateAvailableSlots = async (clinicId, doctorId, date = null) => {
  await assertDoctorInClinic(clinicId, doctorId);

  // SQL explained:
  // - We join doctors -> clinics to obtain clinic.timezone
  // - We fetch doctor_settings (default if null)
  // - We fetch working hours for the weekday of the requested date
  // - generate_series builds candidate start times in clinic tz converted to timestamptz
  // - Filters remove slots overlapping blocked slots or appointments (with buffer)
  //
  // Implementation details:
  // - dateParam is passed as a date string (YYYY-MM-DD). If null, we use (now() AT TIME ZONE clinic.timezone)::date
  //
  const sql = `
  WITH meta AS (
    SELECT d.doctor_id, c.clinic_id, c.timezone,
           COALESCE(s.slot_minutes,15) AS slot_minutes,
           COALESCE(s.lead_time_min,60) AS lead_time_min,
           COALESCE(s.buffer_min,0) AS buffer_min,
           -- compute date in clinic's timezone
           (CASE WHEN $3::text IS NOT NULL THEN $3::date
                 ELSE ( (now() AT TIME ZONE c.timezone)::date ) END) AS target_date
    FROM doctors d
    JOIN clinics c ON c.clinic_id = d.clinic_id
    LEFT JOIN doctor_settings s ON s.doctor_id = d.doctor_id
    WHERE d.doctor_id = $1 AND d.clinic_id = $2
    LIMIT 1
  ),

  wh AS (
    -- working hours for that doctor on the weekday
    SELECT w.*
    FROM doctor_working_hours w
    CROSS JOIN meta m
    WHERE w.doctor_id = m.doctor_id
      AND w.day_of_week = EXTRACT(DOW FROM (m.target_date::date))::int
  ),

  candidate_slots AS (
    -- for each working hour block create a series of slot START times in clinic timezone (as timestamptz)
    SELECT
      m.doctor_id,
      (( (m.target_date::date + wh.start_time::time) AT TIME ZONE m.timezone ))::timestamptz AS block_start,
      (( (m.target_date::date + wh.end_time::time) AT TIME ZONE m.timezone ))::timestamptz AS block_end,
      m.slot_minutes,
      m.lead_time_min,
      m.buffer_min,
      generate_series(
        ((m.target_date::date + wh.start_time::time) AT TIME ZONE m.timezone )::timestamptz,
        (((m.target_date::date + wh.end_time::time) AT TIME ZONE m.timezone )::timestamptz - (m.slot_minutes || ' minutes')::interval),
        (m.slot_minutes || ' minutes')::interval
      ) AS slot_start
    FROM wh
    CROSS JOIN meta m
  ),

  filtered AS (
    SELECT
      cs.slot_start,
      (cs.slot_start + (cs.slot_minutes || ' minutes')::interval) AS slot_end,
      cs.slot_minutes,
      cs.lead_time_min,
      cs.buffer_min
    FROM candidate_slots cs
    WHERE
      -- lead time check: slot_start must be after now + lead_time_min (evaluated in UTC)
      cs.slot_start >= now() + (cs.lead_time_min || ' minutes')::interval
  ),

  no_blocked AS (
    -- remove slots that overlap any blocked_range
    SELECT f.*
    FROM filtered f
    WHERE NOT EXISTS (
      SELECT 1 FROM doctor_blocked_slots b
      WHERE b.doctor_id = $1
        AND b.blocked_range && tstzrange(f.slot_start, f.slot_end, '[)')
    )
  ),

  no_appointments AS (
    -- remove slots that would conflict with existing appointments (consider buffer_min)
    SELECT nb.*
    FROM no_blocked nb
    WHERE NOT EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.doctor_id = $1
        AND a.status IN ('scheduled','confirmed')
        -- appointment overlaps the slot expanded by buffer_min on both sides
        AND a.appointment_ts && tstzrange(
            (nb.slot_start - (nb.buffer_min || ' minutes')::interval),
            (nb.slot_end + (nb.buffer_min || ' minutes')::interval),
            '[)'
        )
    )
  )

  SELECT slot_start AT TIME ZONE 'UTC' AS slot_start_utc,
         slot_end   AT TIME ZONE 'UTC' AS slot_end_utc,
         slot_start AS slot_start_local,
         slot_end   AS slot_end_local,
         slot_minutes
  FROM no_appointments
  ORDER BY slot_start;
  `;

  // params:
  // $1 = doctorId
  // $2 = clinicId
  // $3 = date string (or NULL)
  const { rows } = await db.query(sql, [doctorId, clinicId, date]);

  // Return ISO strings in response. We include both local timestamptz and UTC representation.
  const slots = rows.map(r => ({
    slot_start_local: r.slot_start_local ? r.slot_start_local.toISOString() : null,
    slot_end_local: r.slot_end_local ? r.slot_end_local.toISOString() : null,
    slot_start_utc: r.slot_start_utc ? r.slot_start_utc.toISOString() : null,
    slot_end_utc: r.slot_end_utc ? r.slot_end_utc.toISOString() : null,
    slot_minutes: r.slot_minutes
  }));

  return slots;
};
