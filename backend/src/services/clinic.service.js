// src/services/clinic.service.js

/**
 * Clinic Service
 * ---------------------------------------
 * Handles all database queries related to clinics.
 */

const db = require("../db");

// -------------------------
// GET ALL CLINICS (super admin)
// -------------------------
exports.getAll = async () => {
  const sql = `SELECT * FROM clinics ORDER BY clinic_id DESC`;
  const { rows } = await db.query(sql);
  return rows;
};

// -------------------------
// CREATE CLINIC
// -------------------------
exports.create = async ({ name, address, phone, timezone }) => {
  const sql = `
    INSERT INTO clinics (name, address, phone, timezone)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const { rows } = await db.query(sql, [
    name,
    address || null,
    phone || null,
    timezone || "Asia/Kolkata"
  ]);

  return rows[0];
};

// -------------------------
// GET CLINIC BY ID
// -------------------------
exports.getById = async (clinicId) => {
  const sql = `
    SELECT *
    FROM clinics
    WHERE clinic_id = $1
  `;

  const { rows } = await db.query(sql, [clinicId]);
  return rows[0];
};

// -------------------------
// UPDATE CLINIC
// -------------------------
exports.update = async (clinicId, { name, address, phone, timezone }) => {
  const sql = `
    UPDATE clinics
    SET
      name = COALESCE($1, name),
      address = COALESCE($2, address),
      phone = COALESCE($3, phone),
      timezone = COALESCE($4, timezone),
      updated_at = NOW()
    WHERE clinic_id = $5
    RETURNING *
  `;

  const { rows } = await db.query(sql, [
    name || null,
    address || null,
    phone || null,
    timezone || null,
    clinicId
  ]);

  return rows[0];
};
