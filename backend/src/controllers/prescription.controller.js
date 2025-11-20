// src/modules/prescriptions/prescription.controller.js

const service = require("./prescription.service");

exports.createPrescription = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const createdBy = req.user.user_id;

    const data = await service.createPrescription({
      clinicId,
      createdBy,
      ...req.body
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getByAppointment = async (req, res, next) => {
  try {
    const { appointmentId } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM prescriptions WHERE appointment_id=$1`,
      [appointmentId]
    );
    res.json(rows[0] || null);
  } catch (err) {
    next(err);
  }
};

exports.getByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const { rows } = await db.query(
      `SELECT * FROM prescriptions WHERE patient_id=$1`,
      [patientId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};
