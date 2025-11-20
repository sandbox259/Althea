// src/controllers/patientHistory.controller.js

const service = require("../services/patientHistory.service");

exports.getHistory = async (req, res, next) => {
  try {
    const { patientId } = req.params;
    const clinicId = req.tenant.clinic_id;

    const data = await service.getHistory({ clinicId, patientId });
    res.json(data);
  } catch (err) {
    next(err);
  }
};
