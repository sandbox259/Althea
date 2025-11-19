// src/controllers/clinic.controller.js

/**
 * Clinic Controller
 * ---------------------------------------
 * Contains business logic for:
 *  - Creating a clinic
 *  - Listing all clinics
 *  - Getting clinic admin's clinic
 *  - Updating clinic admin's clinic
 */

const clinicService = require("../services/clinic.service");

// -------------------------
// SUPER ADMIN → LIST ALL
// -------------------------
exports.listClinics = async (req, res, next) => {
  try {
    const clinics = await clinicService.getAll();
    res.json({ clinics });
  } catch (err) {
    next(err);
  }
};

// -------------------------
// SUPER ADMIN → CREATE
// -------------------------
exports.createClinic = async (req, res, next) => {
  try {
    const clinic = await clinicService.create(req.body);
    res.status(201).json({ clinic });
  } catch (err) {
    next(err);
  }
};

// -------------------------
// CLINIC ADMIN → GET MY CLINIC
// -------------------------
exports.getMyClinic = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const clinic = await clinicService.getById(clinicId);

    res.json({ clinic });
  } catch (err) {
    next(err);
  }
};

// -------------------------
// CLINIC ADMIN → UPDATE MY CLINIC
// -------------------------
exports.updateMyClinic = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;

    const clinic = await clinicService.update(clinicId, req.body);
    res.json({ clinic });
  } catch (err) {
    next(err);
  }
};
