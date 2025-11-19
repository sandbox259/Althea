/**
 * src/services/patient.service.js
 *
 * All DB access for patients and patient_contacts.
 *
 * Important:
 *  - clinicId MUST be provided (clinic-scoped). If null and user is super_admin,
 *    allow list across clinics (for admin auditing).
 *
 *  - Use transactions when creating patient + contact to avoid partial state.
 */

const db = require("../db");

/**
 * listPatients({ clinicId, q, limit, offset })
 * - If clinicId is provided -> returns patients for that clinic only
 * - If clinicId is null (super_admin without x-clinic-id) -> returns all patients
 * - q is a simple search applied to full_name (ILIKE) or phone (via contacts)
 */
exports.listPatients = async ({ clinicId, q, limit = 50, offset = 0 }) => {
  // Basic pagination + search
  if (clinicId) {
    // search name or phone within this clinic
    if (q) {
      const sql = `
        SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
        FROM patients p
        LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id AND pc.clinic_id = $1
        WHERE p.clinic_id = $1 AND p.deleted_at IS NULL
          AND (
            p.full_name ILIKE '%' || $2 || '%'
            OR EXISTS (
              SELECT 1 FROM patient_contacts pc2
              WHERE pc2.clinic_id = $1 AND pc2.patient_id = p.patient_id AND pc2.phone ILIKE '%' || $2 || '%'
            )
          )
        GROUP BY p.patient_id
        ORDER BY p.patient_id DESC
        LIMIT $3 OFFSET $4
      `;
      const { rows } = await db.query(sql, [clinicId, q, limit, offset]);

      // count
      const countSql = `
        SELECT COUNT(DISTINCT p.patient_id) AS total
        FROM patients p
        LEFT JOIN patient_contacts pc2 ON pc2.patient_id = p.patient_id AND pc2.clinic_id = $1
        WHERE p.clinic_id = $1 AND p.deleted_at IS NULL
          AND (
            p.full_name ILIKE '%' || $2 || '%'
            OR pc2.phone ILIKE '%' || $2 || '%'
          )
      `;
      const c = await db.query(countSql, [clinicId, q]);
      return { rows, total: Number(c.rows[0].total) };
    } else {
      // no search
      const sql = `
        SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
        FROM patients p
        LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id AND pc.clinic_id = $1
        WHERE p.clinic_id = $1 AND p.deleted_at IS NULL
        GROUP BY p.patient_id
        ORDER BY p.patient_id DESC
        LIMIT $2 OFFSET $3
      `;
      const { rows } = await db.query(sql, [clinicId, limit, offset]);

      const c = await db.query(`SELECT COUNT(*)::int AS total FROM patients WHERE clinic_id=$1 AND deleted_at IS NULL`, [clinicId]);
      return { rows, total: Number(c.rows[0].total) };
    }
  } else {
    // super_admin listing all clinics (no clinicId). Keep it simple: search only by name if provided.
    if (q) {
      const sql = `
        SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
        FROM patients p
        LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id
        WHERE p.deleted_at IS NULL
          AND (p.full_name ILIKE '%' || $1 || '%')
        GROUP BY p.patient_id
        ORDER BY p.patient_id DESC
        LIMIT $2 OFFSET $3
      `;
      const { rows } = await db.query(sql, [q, limit, offset]);
      const c = await db.query(`SELECT COUNT(*)::int AS total FROM patients WHERE deleted_at IS NULL AND full_name ILIKE '%' || $1 || '%'`, [q]);
      return { rows, total: Number(c.rows[0].total) };
    } else {
      const sql = `
        SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
        FROM patients p
        LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id
        WHERE p.deleted_at IS NULL
        GROUP BY p.patient_id
        ORDER BY p.patient_id DESC
        LIMIT $1 OFFSET $2
      `;
      const { rows } = await db.query(sql, [limit, offset]);
      const c = await db.query(`SELECT COUNT(*)::int AS total FROM patients WHERE deleted_at IS NULL`);
      return { rows, total: Number(c.rows[0].total) };
    }
  }
};

/**
 * getPatientById(clinicId, patientId)
 * - Returns patient + contacts if exists and belongs to clinic.
 */
exports.getPatientById = async (clinicId, patientId) => {
  if (!clinicId) {
    // super_admin: fetch across clinics
    const sql = `
      SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
      FROM patients p
      LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id
      WHERE p.patient_id = $1 AND p.deleted_at IS NULL
      GROUP BY p.patient_id
    `;
    const { rows } = await db.query(sql, [patientId]);
    return rows[0];
  }

  const sql = `
    SELECT p.*, json_agg(pc.*) FILTER (WHERE pc.contact_id IS NOT NULL) AS contacts
    FROM patients p
    LEFT JOIN patient_contacts pc ON pc.patient_id = p.patient_id AND pc.clinic_id = $1
    WHERE p.patient_id = $2 AND p.clinic_id = $1 AND p.deleted_at IS NULL
    GROUP BY p.patient_id
  `;
  const { rows } = await db.query(sql, [clinicId, patientId]);
  return rows[0];
};

/**
 * findOrCreateByPhone({ clinicId, phone, full_name, relationship })
 *
 * - Lookup patient_contacts for this phone and clinic
 * - If found: return list of patients linked to this phone
 * - If not found: create a new patient record AND create a patient_contacts row linking the phone to the newly created patient
 * - Use a transaction to ensure both patient and contact are created atomically
 */
exports.findOrCreateByPhone = async ({ clinicId, phone, full_name, relationship = "self" }) => {
  if (!clinicId) throw new Error("clinicId is required");

  // 1) find matching contacts for this clinic
  const findSql = `
    SELECT p.patient_id, p.full_name, p.date_of_birth, p.gender, pc.contact_id, pc.relationship, pc.phone
    FROM patient_contacts pc
    JOIN patients p ON p.patient_id = pc.patient_id
    WHERE pc.clinic_id = $1 AND pc.phone = $2 AND p.deleted_at IS NULL
  `;
  const found = await db.query(findSql, [clinicId, phone]);
  if (found.rowCount > 0) {
    // return matching patient records
    // map to a simpler structure
    const patients = found.rows.map(r => ({
      patient_id: r.patient_id,
      full_name: r.full_name,
      date_of_birth: r.date_of_birth,
      gender: r.gender,
      contact: { contact_id: r.contact_id, phone: r.phone, relationship: r.relationship }
    }));
    return { patients, created: false };
  }

  // 2) not found -> create new patient + contact in a transaction
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");

    const insP = `
      INSERT INTO patients (clinic_id, full_name)
      VALUES ($1, $2)
      RETURNING patient_id, full_name, date_of_birth, gender
    `;
    const pRes = await client.query(insP, [clinicId, full_name || "Unknown"]);

    const patient = pRes.rows[0];

    const insC = `
      INSERT INTO patient_contacts (clinic_id, patient_id, phone, relationship, is_primary)
      VALUES ($1, $2, $3, $4, true)
      RETURNING contact_id, phone, relationship, is_primary
    `;
    const cRes = await client.query(insC, [clinicId, patient.patient_id, phone, relationship || "self"]);

    await client.query("COMMIT");

    return {
      patients: [{
        patient_id: patient.patient_id,
        full_name: patient.full_name,
        date_of_birth: patient.date_of_birth,
        gender: patient.gender,
        contact: cRes.rows[0]
      }],
      created: true,
      createdPatient: patient
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

/**
 * addContact({ clinicId, patientId, phone, relationship, is_primary })
 * - Insert a patient_contacts row (unique constraint prevents duplicates per patient)
 */
exports.addContact = async ({ clinicId, patientId, phone, relationship = "guardian", is_primary = false }) => {
  // ensure patient exists and is in clinic
  const chk = await db.query(`SELECT patient_id FROM patients WHERE patient_id=$1 AND clinic_id=$2 AND deleted_at IS NULL`, [patientId, clinicId]);
  if (chk.rowCount === 0) throw new Error("Patient not found in this clinic");

  const sql = `
    INSERT INTO patient_contacts (clinic_id, patient_id, phone, relationship, is_primary)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const { rows } = await db.query(sql, [clinicId, patientId, phone, relationship || "guardian", is_primary]);
  return rows[0];
};

/**
 * updatePatient(clinicId, patientId, updates)
 * - Update allowed fields on patients table
 */
exports.updatePatient = async (clinicId, patientId, updates) => {
  // enforce clinic scope
  const { full_name, date_of_birth, gender, medical_history, allergies } = updates;

  const sql = `
    UPDATE patients
    SET
      full_name = COALESCE($1, full_name),
      date_of_birth = COALESCE($2, date_of_birth),
      gender = COALESCE($3, gender),
      medical_history = COALESCE($4, medical_history),
      allergies = COALESCE($5, allergies),
      updated_at = NOW()
    WHERE patient_id = $6 AND clinic_id = $7
    RETURNING *
  `;
  const params = [full_name || null, date_of_birth || null, gender || null, medical_history || null, allergies || null, patientId, clinicId];
  const { rows } = await db.query(sql, params);
  return rows[0];
};
