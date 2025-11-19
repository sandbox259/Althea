// src/routes/clinic.routes.js

/**
 * Clinic Routes
 * -------------------------------------
 * super_admin:
 *    GET /api/clinics        → list all clinics
 *    POST /api/clinics       → create new clinic
 *
 * clinic_admin:
 *    GET /api/clinics/me     → get my clinic details
 *    PATCH /api/clinics/me   → update my clinic
 */

const router = require("express").Router();
const { body } = require("express-validator");

const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const tenantScope = require("../middleware/tenantScope");
const validate = require("../middleware/validate");

const clinicController = require("../controllers/clinic.controller");
const { ROLES } = require("../utils/constants");

// All clinic routes require a logged-in user
router.use(auth);

// -------------------------------
// SUPER ADMIN → LIST ALL CLINICS
// -------------------------------
router.get(
  "/",
  requireRole(ROLES.SUPER),
  clinicController.listClinics
);

// -------------------------------
// SUPER ADMIN → CREATE A NEW CLINIC
// -------------------------------
router.post(
  "/",
  requireRole(ROLES.SUPER),
  [
    body("name").notEmpty(),
    body("address").optional(),
    body("phone").optional(),
    body("timezone").optional()
  ],
  validate,
  clinicController.createClinic
);

// -------------------------------
// CLINIC ADMIN → GET OWN CLINIC
// -------------------------------
router.get(
  "/me",
  tenantScope,
  requireRole(ROLES.CLINIC_ADMIN),
  clinicController.getMyClinic
);

// -------------------------------
// CLINIC ADMIN → UPDATE OWN CLINIC
// -------------------------------
router.patch(
  "/me",
  tenantScope,
  requireRole(ROLES.CLINIC_ADMIN),
  [
    body("name").optional(),
    body("address").optional(),
    body("phone").optional(),
    body("timezone").optional()
  ],
  validate,
  clinicController.updateMyClinic
);

module.exports = router;
