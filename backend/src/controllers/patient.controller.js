/**
 * src/controllers/patient.controller.js
 *
 * Controllers are thin: they validate/parse request and call service layer.
 * They must NOT contain SQL. Services do DB work.
 */

const patientService = require("../services/patient.service");

// LIST patients for the clinic (supports simple q search)
exports.listPatients = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id; // null if super_admin without x-clinic-id
    const q = req.query.q || null;
    const limit = Number(req.query.limit || 50);
    const offset = Number(req.query.offset || 0);

    const { rows, total } = await patientService.listPatients({ clinicId, q, limit, offset });
    res.json({ patients: rows, total });
  } catch (err) {
    next(err);
  }
};

// GET single patient (must be in same clinic)
exports.getPatient = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const patientId = Number(req.params.patient_id);

    const patient = await patientService.getPatientById(clinicId, patientId);
    if (!patient) return res.status(404).json({ error: "Patient not found" });

    res.json({ patient });
  } catch (err) {
    next(err);
  }
};

// FIND OR CREATE by phone
// Returns { patients: [...], created: boolean }
exports.findOrCreateByPhone = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const { phone, full_name, relationship } = req.body;

    const result = await patientService.findOrCreateByPhone({ clinicId, phone, full_name, relationship });
    // result: { patients: [...matching patients...], created: boolean, createdPatient }
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    next(err);
  }
};

// ADD a contact for a patient (link phone -> patient)
exports.addContact = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const patientId = Number(req.params.patient_id);
    const { phone, relationship, is_primary } = req.body;

    const contact = await patientService.addContact({ clinicId, patientId, phone, relationship, is_primary });
    res.status(201).json({ contact });
  } catch (err) {
    next(err);
  }
};

// UPDATE patient profile
exports.updatePatient = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const patientId = Number(req.params.patient_id);
    const updates = req.body;

    const updated = await patientService.updatePatient(clinicId, patientId, updates);
    res.json({ patient: updated });
  } catch (err) {
    next(err);
  }
};
