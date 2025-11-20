// src/routes/medicalFiles.routes.js

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/medicalFiles.controller");
const { requireRoles } = require("../middleware/auth");

// Upload reports (doctor/admin/staff)
router.post(
  "/",
  requireRoles(["doctor", "clinic_admin", "staff"]),
  ctrl.uploadFile
);

// Get patient files
router.get(
  "/patient/:patientId",
  requireRoles(["doctor", "clinic_admin", "staff"]),
  ctrl.listByPatient
);

// Get single file
router.get(
  "/:fileId",
  requireRoles(["doctor", "clinic_admin", "staff"]),
  ctrl.getFile
);

// Delete file
router.delete(
  "/:fileId",
  requireRoles(["doctor", "clinic_admin"]),
  ctrl.deleteFile
);

module.exports = router;
