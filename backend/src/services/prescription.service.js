// src/modules/prescriptions/prescription.service.js

const db = require("../../db");
const pdfService = require("../../services/pdf.service");
const whatsappService = require("../../services/whatsapp.service");
const uploadService = require("../../services/upload.service"); // your S3 uploader

exports.createPrescription = async ({
  clinicId,
  appointment_id,
  patient_id,
  doctor_id,
  diagnosis,
  medicines,
  notes,
  createdBy
}) => {
  // 1. Insert into DB
  const insertSql = `
    INSERT INTO prescriptions (
      clinic_id, appointment_id, patient_id, doctor_id, diagnosis, medicines, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `;
  const { rows } = await db.query(insertSql, [
    clinicId,
    appointment_id,
    patient_id,
    doctor_id,
    diagnosis,
    medicines,
    notes
  ]);

  const prescription = rows[0];

  // 2. Fetch doctor, patient & clinic info
  const doctor = await fetchDoctor(doctor_id);
  const patient = await fetchPatient(patient_id);
  const clinic = await fetchClinic(clinicId);

  // 3. Generate PDF buffer
  const pdfBuffer = await pdfService.generatePrescriptionPDF({
    prescription,
    clinic,
    doctor,
    patient
  });

  // 4. Upload PDF (to S3 or cloud)
  const pdf_url = await uploadService.uploadBuffer(pdfBuffer, {
    path: `prescriptions/${prescription.prescription_id}.pdf`,
    contentType: "application/pdf"
  });

  // 5. Update DB with pdf_url
  await db.query(
    `UPDATE prescriptions SET pdf_url = $1 WHERE prescription_id = $2`,
    [pdf_url, prescription.prescription_id]
  );

  // 6. Fetch patient phone
  const phoneRes = await db.query(
    `SELECT phone FROM patient_contacts WHERE patient_id=$1 LIMIT 1`,
    [patient_id]
  );

  const patientPhone = phoneRes.rows[0]?.phone;
  if (patientPhone) {
    // 7. Send PDF on WhatsApp
    await whatsappService.sendDocumentMessage({
      clinicId,
      to: patientPhone,
      url: pdf_url,
      filename: `prescription-${prescription.prescription_id}.pdf`
    });
  }

  return { ...prescription, pdf_url };
};

// helper fetchers
async function fetchPatient(id) {
  const { rows } = await db.query(
    `SELECT patient_id, full_name FROM patients WHERE patient_id = $1`,
    [id]
  );
  return rows[0];
}

async function fetchDoctor(id) {
  const { rows } = await db.query(
    `SELECT d.doctor_id, u.full_name, d.specialization 
     FROM doctors d JOIN app_users u ON u.user_id = d.user_id
     WHERE d.doctor_id = $1`,
    [id]
  );
  return rows[0];
}

async function fetchClinic(id) {
  const { rows } = await db.query(
    `SELECT clinic_id, name, address FROM clinics WHERE clinic_id = $1`,
    [id]
  );
  return rows[0];
}
