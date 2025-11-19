// src/controllers/appointment.controller.js

/**
 * Appointment Controller
 * -------------------------------------
 * Thin controllers — call service layer
 */

const service = require("../services/appointment.service");

exports.createAppointment = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;

    const appointment = await service.createAppointment({
      clinicId,
      createdBy: req.user.user_id,
      ...req.body,
    });

    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
};

exports.listAppointments = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;

    const appointments = await service.listAppointments({
      clinicId,
      ...req.query,
    });

    res.json({ appointments });
  } catch (err) {
    next(err);
  }
};

exports.getAppointment = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const id = Number(req.params.id);

    const appt = await service.getAppointment(clinicId, id);
    if (!appt) return res.status(404).json({ error: "Not found" });

    res.json({ appointment: appt });
  } catch (err) {
    next(err);
  }
};

exports.updateAppointment = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const id = Number(req.params.id);

    const updated = await service.updateAppointment({
      appointmentId: id,
      clinicId,
      updatedBy: req.user.user_id,
      ...req.body,
    });

    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
};
