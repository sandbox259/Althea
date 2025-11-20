// src/routes/patientHistory.routes.js

const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/patientHistory.controller");
const { requireRoles } = require("../middleware/auth");

router.get(
  "/:patientId",
  requireRoles(["doctor", "clinic_admin", "staff"]),
  ctrl.getHistory
);

module.exports = router;
