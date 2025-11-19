// src/controllers/doctor.controller.js

/**
 * Doctor Controller
 * ------------------------------------------------
 * Contains business logic for:
 *  - Listing doctors
 *  - Creating a doctor
 *  - Updating doctor details
 *
 * Notes:
 *  - Never write SQL here. Controllers only orchestrate
 *    and call service functions.
 *  - tenantScope middleware has already provided:
 *        req.tenant.clinic_id
 */

const doctorService = require("../services/doctor.service");

// --------------------------------------------------
// LIST DOCTORS IN CURRENT CLINIC
// --------------------------------------------------
exports.listDoctors = async (req, res, next) => {
  try {
    /**
     * For super_admin:
     *   - They can pass x-clinic-id header to filter clinic
     *
     * For others:
     *   - req.tenant.clinic_id is set automatically
     */
    const clinicId = req.tenant.clinic_id;

    const doctors = await doctorService.getDoctorsByClinic(clinicId);

    return res.json({ doctors });
  } catch (err) {
    next(err);
  }
};

// --------------------------------------------------
// CREATE DOCTOR FOR CURRENT CLINIC
// --------------------------------------------------
exports.createDoctor = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;

    /**
     * We expect:
     *  user_id: reference to app_users.user_id
     *  specialization: optional
     *  fee_amount: optional
     */
    const doctor = await doctorService.createDoctor(clinicId, req.body);

    return res.status(201).json({ doctor });
  } catch (err) {
    next(err);
  }
};

// --------------------------------------------------
// UPDATE DOCTOR DETAILS
// --------------------------------------------------
exports.updateDoctor = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const doctorId = Number(req.params.doctor_id);

    const updatedDoctor = await doctorService.updateDoctor(
      clinicId,
      doctorId,
      req.body
    );

    return res.json({ doctor: updatedDoctor });
  } catch (err) {
    next(err);
  }
};
