// src/controllers/medicalFiles.controller.js

const service = require("../services/medicalFiles.service");
const multiparty = require("multiparty");

exports.uploadFile = async (req, res, next) => {
  const clinicId = req.tenant.clinic_id;
  const uploadedBy = req.user.user_id;

  const form = new multiparty.Form();
  form.parse(req, async (err, fields, files) => {
    if (err) return next(err);

    const file = files.file?.[0];
    if (!file) return res.status(400).json({ error: "File is required" });

    try {
      const data = await service.uploadFile({
        clinicId,
        uploadedBy,
        patient_id: fields.patient_id?.[0],
        appointment_id: fields.appointment_id?.[0] || null,
        file_type: fields.file_type?.[0],
        file
      });

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  });
};

exports.listByPatient = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.tenant.clinic_id;

    const data = await service.listByPatient({ clinicId, patientId });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const clinicId = req.tenant.clinic_id;

    const data = await service.getFile({ clinicId, fileId });
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.deleteFile = async (req, res, next) => {
  try {
    const clinicId = req.tenant.clinic_id;
    const { fileId } = req.params;

    await service.deleteFile({ clinicId, fileId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
