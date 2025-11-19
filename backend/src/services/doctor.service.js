// src/services/doctor.service.js

/**
 * Doctor Service
 * ------------------------------------------------
 * Handles all database operations related to doctors.
 *
 * IMPORTANT:
 *   - Always use clinic_id in WHERE clauses!
 *     This ensures multi-clinic data is isolated.
 */

const db = require("../db");

// --------------------------------------------------
// GET DOCTORS BELONGING TO A CLINIC
// --------------------------------------------------
exports.getDoctorsByClinic = async (clinicId) => {
  /**
   * If super_admin has no clinic_id (null)
   * → list ALL doctors in the system.
   */
  if (!clinicId) {
    const sql = `
      SELECT doctor_id, clinic_id, user_id, specialization, fee_amount, is_active
      FROM doctors
      ORDER BY doctor_id DESC
    `;
    const { rows } = await db.query(sql);
    return rows;
  }

  // For clinic-specific users
  const sql = `
    SELECT doctor_id, clinic_id, user_id, specialization, fee_amount, is_active
    FROM doctors
    WHERE clinic_id = $1
    ORDER BY doctor_id DESC
  `;
  const { rows } = await db.query(sql, [clinicId]);
  return rows;
};

// --------------------------------------------------
// CREATE DOCTOR RECORD
// --------------------------------------------------
exports.createDoctor = async (clinicId, { user_id, specialization, fee_amount }) => {
  /**
   * Rules:
   *  - The user_id MUST belong to the same clinic
   *  - The role of that user MUST be "doctor"
   */
  const checkUserSql = `
    SELECT user_id, clinic_id, role
    FROM app_users
    WHERE user_id = $1
  `;
  const userCheck = await db.query(checkUserSql, [user_id]);
  const user = userCheck.rows[0];

  if (!user) {
    throw new Error("User does not exist");
  }
  if (user.clinic_id !== clinicId) {
    throw new Error("User does not belong to this clinic");
  }
  if (user.role !== "doctor") {
    throw new Error("User is not assigned the 'doctor' role");
  }

  // Create doctor profile
  const sql = `
    INSERT INTO doctors (clinic_id, user_id, specialization, fee_amount)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const { rows } = await db.query(sql, [
    clinicId,
    user_id,
    specialization || null,
    fee_amount || null
  ]);

  return rows[0];
};

// --------------------------------------------------
// UPDATE DOCTOR DETAILS
// --------------------------------------------------
exports.updateDoctor = async (clinicId, doctorId, updates) => {
  const { specialization, fee_amount, is_active } = updates;

  const sql = `
    UPDATE doctors
    SET
      specialization = COALESCE($1, specialization),
      fee_amount     = COALESCE($2, fee_amount),
      is_active      = COALESCE($3, is_active),
      updated_at     = NOW()
    WHERE doctor_id = $4
      AND clinic_id = $5
    RETURNING *
  `;

  const { rows } = await db.query(sql, [
    specialization || null,
    fee_amount || null,
    is_active,
    doctorId,
    clinicId
  ]);

  return rows[0];
};
