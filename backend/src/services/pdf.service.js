// src/services/pdf.service.js
/**
 * PDF Service
 * Generates professional prescription PDFs using Puppeteer (HTML → PDF)
 */

const path = require("path");
const fs = require("fs/promises");
const puppeteer = require("puppeteer");

module.exports.generatePrescriptionPDF = async ({ prescription, clinic, doctor, patient }) => {
  // Construct the HTML string
  const html = buildPrescriptionHTML({ prescription, clinic, doctor, patient });

  // Launch Puppeteer (headless browser)
  const browser = await puppeteer.launch({
    headless: "new"
  });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  // Generate PDF buffer
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "15mm",
      right: "15mm"
    }
  });

  await browser.close();
  return pdfBuffer;
};

/**
 * Build HTML for prescription
 */
function buildPrescriptionHTML({ prescription, clinic, doctor, patient }) {
  const medsHTML = (prescription.medicines || [])
    .map(
      (m) => `
      <tr>
        <td>${m.name}</td>
        <td>${m.dose}</td>
        <td>${m.freq}</td>
        <td>${m.days}</td>
        <td>${m.notes || ""}</td>
      </tr>
    `
    )
    .join("");

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { text-align: center; margin-bottom: 10px; }
          .section-title { font-weight: bold; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          table, th, td { border: 1px solid #ccc; }
          th, td { padding: 8px; text-align: left; }
          .footer { margin-top: 40px; font-size: 12px; text-align: center; }
          .clinic-info { text-align: center; font-size: 14px; color: #444; }
        </style>
      </head>
      <body>
        <h1>Prescription</h1>
        <div class="clinic-info">
          <div><strong>${clinic.name}</strong></div>
          <div>${clinic.address || ""}</div>
        </div>

        <div class="section-title">Patient Information</div>
        <p><strong>Name:</strong> ${patient.full_name}</p>

        <div class="section-title">Doctor</div>
        <p><strong>Dr. ${doctor.full_name}</strong> (${doctor.specialization || "General"})</p>

        <div class="section-title">Diagnosis</div>
        <p>${prescription.diagnosis || "N/A"}</p>

        <div class="section-title">Medicines</div>
        <table>
          <tr>
            <th>Name</th>
            <th>Dose</th>
            <th>Frequency</th>
            <th>Days</th>
            <th>Notes</th>
          </tr>
          ${medsHTML}
        </table>

        <div class="section-title">Notes</div>
        <p>${prescription.notes || ""}</p>

        <div class="footer">
          Generated on ${new Date().toLocaleString()}
        </div>
      </body>
    </html>
  `;
}
