// src/services/patientHistory.service.js

const db = require("../db");

exports.getHistory = async ({ clinicId, patientId }) => {
  // 1. Patient info
  const patient = (
    await db.query(
      `SELECT patient_id, full_name, created_at
       FROM patients
       WHERE clinic_id=$1 AND patient_id=$2`,
      [clinicId, patientId]
    )
  ).rows[0];
  if (!patient) return null;

  // 2. Appointments
  const appointments = (
    await db.query(
      `SELECT appointment_id, doctor_id, appointment_start, appointment_end, status, notes
       FROM appointments
       WHERE clinic_id=$1 AND patient_id=$2
       ORDER BY appointment_start DESC`,
      [clinicId, patientId]
    )
  ).rows;

  // 3. Prescriptions
  const prescriptions = (
    await db.query(
      `SELECT p.*, u.full_name AS doctor_name
       FROM prescriptions p
       JOIN doctors d ON d.doctor_id = p.doctor_id
       JOIN app_users u ON u.user_id = d.user_id
       WHERE p.clinic_id=$1 AND p.patient_id=$2
       ORDER BY p.created_at DESC`,
      [clinicId, patientId]
    )
  ).rows;

  // 4. Medical Files
  const files = (
    await db.query(
      `SELECT file_id, file_url, file_type, appointment_id, uploaded_at
       FROM medical_files
       WHERE clinic_id=$1 AND patient_id=$2
       ORDER BY uploaded_at DESC`,
      [clinicId, patientId]
    )
  ).rows;

  return {
    patient,
    appointments,
    prescriptions,
    medical_files: files
  };
};
