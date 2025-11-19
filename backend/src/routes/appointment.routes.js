// src/routes/appointment.routes.js

/**
 * Appointment Endpoints
 * --------------------------------------
 *  POST   /            -> create appointment
 *  GET    /            -> list appointments (with filters)
 *  GET    /:id         -> get one appointment
 *  PATCH  /:id         -> update (reschedule, change status)
 */

const router = require("express").Router();
const { body, query, param } = require("express-validator");

const auth = require("../middleware/auth");
const tenantScope = require("../middleware/tenantScope");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { ROLES } = require("../utils/constants");

const ctrl = require("../controllers/appointment.controller");

// All appointment routes require login + clinic scope
router.use(auth, tenantScope);

/* -------------------------------------------
   CREATE APPOINTMENT
----------------------------------------------*/
router.post(
  "/",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF),
  [
    body("doctor_id").isInt(),
    body("patient_id").isInt(),
    body("start").isISO8601(),
    body("end").isISO8601(),
    body("mode").optional().isIn(["offline", "online"]),
    body("source").optional().isIn(["whatsapp", "manual"]),
    body("notes").optional().isString(),
  ],
  validate,
  ctrl.createAppointment
);

/* -------------------------------------------
   LIST APPOINTMENTS (clinic-scoped)
----------------------------------------------*/
router.get(
  "/",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [
    query("doctor_id").optional().isInt(),
    query("status").optional().isString(),
    query("date").optional().isISO8601(),
  ],
  validate,
  ctrl.listAppointments
);

/* -------------------------------------------
   GET SINGLE APPOINTMENT
----------------------------------------------*/
router.get(
  "/:id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [param("id").isInt()],
  validate,
  ctrl.getAppointment
);

/* -------------------------------------------
   UPDATE APPOINTMENT
----------------------------------------------*/
router.patch(
  "/:id",
  requireRole(ROLES.SUPER, ROLES.CLINIC_ADMIN, ROLES.STAFF, ROLES.DOCTOR),
  [
    param("id").isInt(),
    body("start").optional().isISO8601(),
    body("end").optional().isISO8601(),
    body("status").optional().isIn(["scheduled", "confirmed", "completed", "cancelled", "no_show"]),
    body("notes").optional().isString(),
  ],
  validate,
  ctrl.updateAppointment
);

module.exports = router;
