/**
 * src/routes/patient.routes.js
 *
 * Patient-related endpoints:
 *  - GET    /api/patients                -> list patients (clinic-scoped)
 *  - GET    /api/patients/:patient_id    -> get single patient
 *  - POST   /api/patients/find-or-create-by-phone -> find contacts by phone OR create patient+contact
 *  - POST   /api/patients/:patient_id/contacts   -> add a contact (guardian/secondary phone)
 *  - PATCH  /api/patients/:patient_id    -> update patient details
 *
 * All routes are protected by:
 *  - auth (JWT)
 *  - tenantScope (resolves req.tenant.clinic_id)
 *
 * Role rules:
 *  - Listing and reading: super_admin, clinic_admin, staff, doctor
 *  - Creating (via find-or-create) and adding contact: clinic_admin, staff (and super_admin)
 *  - Updating patient details: clinic_admin, staff
 */

const router = require("express").Router();
const { body, param, query } = require("express-validator");

const auth = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { ROLES } = require("../utils/constants");

const patientCtrl = require("../controllers/patient.controller");

// All endpoints here require authentication + tenant scope
router.use(auth, tenantScope);

// LIST patients (optional search by name or phone)
router.get(
  "/",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [
    query("q").optional().isString().trim(),   // optional quick search
    query("limit").optional().isInt({ min: 1, max: 500 }),
    query("offset").optional().isInt({ min: 0 })
  ],
  validate,
  patientCtrl.listPatients
);

// GET single patient (clinic-scoped)
router.get(
  "/:patient_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [ param("patient_id").isInt() ],
  validate,
  patientCtrl.getPatient
);

// FIND OR CREATE by phone (used in WhatsApp booking or staff)
router.post(
  "/find-or-create-by-phone",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF),
  [
    body("phone").isString().notEmpty().withMessage("phone is required"),
    body("full_name").optional().isString(),
    body("relationship").optional().isString()  // 'self'|'father'|'mother' etc
  ],
  validate,
  patientCtrl.findOrCreateByPhone
);

// ADD contact (guardian/secondary phone) to existing patient
router.post(
  "/:patient_id/contacts",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF),
  [
    param("patient_id").isInt(),
    body("phone").isString().notEmpty(),
    body("relationship").optional().isString(),
    body("is_primary").optional().isBoolean()
  ],
  validate,
  patientCtrl.addContact
);

// UPDATE patient profile
router.patch(
  "/:patient_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF),
  [
    param("patient_id").isInt(),
    body("full_name").optional().isString(),
    body("date_of_birth").optional().isISO8601(),
    body("gender").optional().isIn(["male","female","other"]),
    body("medical_history").optional().isString(),
    body("allergies").optional().isString()
  ],
  validate,
  patientCtrl.updatePatient
);

module.exports = router;
