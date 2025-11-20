// src/modules/prescriptions/prescription.routes.js

const express = require("express");
const router = express.Router();
const ctrl = require("./prescription.controller");
const { requireRoles } = require("../../middleware/auth");

// Create prescription
router.post(
  "/",
  requireRoles(["doctor", "clinic_admin"]),
  ctrl.createPrescription
);

// Get by appointment
router.get("/appointment/:appointmentId", ctrl.getByAppointment);

// Get by patient
router.get("/patient/:patientId", ctrl.getByPatient);

module.exports = router;
