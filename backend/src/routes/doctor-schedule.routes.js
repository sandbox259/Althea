// src/routes/doctor-schedule.routes.js

/**
 * Doctor Scheduling Routes
 *
 * All scheduling endpoints require:
 *  - auth (JWT)
 *  - tenantScope (clinic scoping)
 *
 * Endpoints:
 *  - GET  /settings/:doctor_id
 *  - PATCH /settings/:doctor_id
 *
 *  - GET  /working-hours/:doctor_id
 *  - POST /working-hours/:doctor_id
 *  - DELETE /working-hours/:doctor_id/:id
 *
 *  - GET  /blocked/:doctor_id       (list blocked slots)
 *  - POST /blocked/:doctor_id       (create blocked slot)
 *  - DELETE /blocked/:doctor_id/:id (remove blocked slot)
 *
 *  - GET  /slots/:doctor_id?date=YYYY-MM-DD
 *      -> generate available slots for the doctor on the given date
 *
 */

const router = require("express").Router();
const { body, param, query } = require("express-validator");

const auth = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { ROLES } = require("../utils/constants");

const ctrl = require("../controllers/doctor-schedule.controller");

// All routes require authentication + tenant scoping
router.use(auth, tenantScope);

/* --------------------------
   Doctor Settings
   -------------------------- */
router.get(
  "/settings/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.DOCTOR, ROLES.STAFF),
  [param("doctor_id").isInt()],
  validate,
  ctrl.getSettings
);

router.patch(
  "/settings/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.DOCTOR),
  [
    param("doctor_id").isInt(),
    body("slot_minutes").optional().isInt({ min: 5, max: 180 }),
    body("lead_time_min").optional().isInt({ min: 0, max: 1440 }),
    body("buffer_min").optional().isInt({ min: 0, max: 120 })
  ],
  validate,
  ctrl.updateSettings
);

/* --------------------------
   Working Hours (weekly)
   -------------------------- */
router.get(
  "/working-hours/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.DOCTOR, ROLES.STAFF),
  [param("doctor_id").isInt()],
  validate,
  ctrl.getWorkingHours
);

router.post(
  "/working-hours/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [
    param("doctor_id").isInt(),
    body("day_of_week").isInt({ min: 0, max: 6 }), // 0=Sun .. 6=Sat
    body("start_time").isString().matches(/^\d{2}:\d{2}$/).withMessage("HH:MM"),
    body("end_time").isString().matches(/^\d{2}:\d{2}$/).withMessage("HH:MM")
  ],
  validate,
  ctrl.addWorkingHour
);

router.delete(
  "/working-hours/:doctor_id/:id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [param("doctor_id").isInt(), param("id").isInt()],
  validate,
  ctrl.deleteWorkingHour
);

/* --------------------------
   Blocked Slots (one-off)
   -------------------------- */
router.get(
  "/blocked/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.DOCTOR, ROLES.STAFF),
  [param("doctor_id").isInt()],
  validate,
  ctrl.listBlockedSlots
);

router.post(
  "/blocked/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [
    param("doctor_id").isInt(),
    body("start").isISO8601(),
    body("end").isISO8601(),
    body("reason").optional().isString()
  ],
  validate,
  ctrl.createBlockedSlot
);

router.delete(
  "/blocked/:doctor_id/:id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN),
  [param("doctor_id").isInt(), param("id").isInt()],
  validate,
  ctrl.deleteBlockedSlot
);

/* --------------------------
   Generate available slots
   -------------------------- */
// GET /api/doctor-schedule/slots/:doctor_id?date=2025-11-19
router.get(
  "/slots/:doctor_id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [
    param("doctor_id").isInt(),
    query("date").optional().isISO8601().withMessage("Use YYYY-MM-DD format")
  ],
  validate,
  ctrl.getAvailableSlots
);

module.exports = router;
