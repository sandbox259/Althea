// src/controllers/doctor-schedule.controller.js

/**
 * Doctor Scheduling Controller
 *
 * Thin controllers — they validate inputs and call service functions.
 * All heavy lifting is in services (DB + logic).
 */

const service = require("../services/doctor-schedule.service");

/* -------------------------
   Settings
   ------------------------- */
exports.getSettings = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);

    const settings = await service.getSettings(clinicId, doctorId);
    if (!settings) return res.status(404).json({ error: "Settings not found" });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const updates = req.body;

    const updated = await service.updateSettings(clinicId, doctorId, updates);
    res.json({ settings: updated });
  } catch (err) {
    next(err);
  }
};

/* -------------------------
   Working Hours
   ------------------------- */
exports.getWorkingHours = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const rows = await service.getWorkingHours(clinicId, doctorId);
    res.json({ working_hours: rows });
  } catch (err) {
    next(err);
  }
};

exports.addWorkingHour = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const { day_of_week, start_time, end_time } = req.body;

    const row = await service.addWorkingHour(clinicId, doctorId, { day_of_week, start_time, end_time });
    res.status(201).json({ working_hour: row });
  } catch (err) {
    next(err);
  }
};

exports.deleteWorkingHour = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const id = Number(req.params.id);

    await service.deleteWorkingHour(clinicId, doctorId, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/* -------------------------
   Blocked Slots
   ------------------------- */
exports.listBlockedSlots = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const rows = await service.listBlockedSlots(clinicId, doctorId);
    res.json({ blocked: rows });
  } catch (err) {
    next(err);
  }
};

exports.createBlockedSlot = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const { start, end, reason } = req.body;

    const row = await service.createBlockedSlot(clinicId, doctorId, { start, end, reason });
    res.status(201).json({ blocked_slot: row });
  } catch (err) {
    next(err);
  }
};

exports.deleteBlockedSlot = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    const id = Number(req.params.id);

    await service.deleteBlockedSlot(clinicId, doctorId, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/* -------------------------
   Generate Available Slots
   ------------------------- */
exports.getAvailableSlots = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);
    // date param is optional — default to today in clinic timezone
    const date = req.query.date || null;

    const slots = await service.generateAvailableSlots(clinicId, doctorId, date);
    res.json({ slots });
  } catch (err) {
    next(err);
  }
};
