// src/routes/doctor.routes.js

/**
 * Doctor Routes
 * ---------------------------------------------
 * These routes handle doctor-related operations.
 *
 * Access Levels:
 *  - super_admin: Can view doctors across all clinics
 *  - clinic_admin: Can create/update doctors in THEIR clinic
 *  - staff/doctor: Can view doctors of their clinic
 *
 * Middleware Order:
 *  1. auth         → verifies JWT token
 *  2. tenantScope  → determines clinic_id for the user
 *  3. requireRole  → checks role permissions for each endpoint
 */

const router = require("express").Router();
const { body, param } = require("express-validator");

const auth = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");

const doctorController = require("../controllers/doctor.controller");
const { ROLES } = require("../utils/constants");

// --------------------------------------------------
// ALL ROUTES BELOW REQUIRE USER TO BE LOGGED IN
// --------------------------------------------------
router.use(auth, tenantScope);

// --------------------------------------------------
// LIST DOCTORS (super_admin OR clinic users)
// --------------------------------------------------
router.get(
  "/",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  doctorController.listDoctors
);

// --------------------------------------------------
// CREATE A DOCTOR (only super_admin / clinic_admin)
// --------------------------------------------------
router.post(
  "/",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [
    body("user_id")
      .isInt()
      .withMessage("user_id must be a valid user identifier"),
    body("specialization").optional().isString(),
    body("fee_amount").optional().isFloat(),
  ],
  validate,
  doctorController.createDoctor
);

// --------------------------------------------------
// UPDATE DOCTOR (only super_admin / clinic_admin)
// --------------------------------------------------
router.patch(
  "/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [
    param("doctor_id").isInt(),
    body("specialization").optional().isString(),
    body("fee_amount").optional().isFloat(),
    body("is_active").optional().isBoolean(),
  ],
  validate,
  doctorController.updateDoctor
);

module.exports = router;
