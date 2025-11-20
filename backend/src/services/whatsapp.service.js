// src/services/whatsapp.service.js
/**
 * WhatsApp low-level service
 * - lookup clinic by phone_number_id
 * - log incoming/outgoing messages (whatsapp_logs)
 * - send messages using decrypted access token
 */

const db = require("../db");
const axios = require("axios");
const { decryptText } = require("../utils/crypto");

const WA_API_VERSION = process.env.WA_API_VERSION || "v17.0"; // change if needed

// map phone_number_id -> clinic_id
async function lookupClinicByPhoneNumberId(phoneNumberId) {
  const sql = `SELECT clinic_id, phone_number_id FROM whatsapp_credentials WHERE phone_number_id = $1 LIMIT 1`;
  const { rows } = await db.query(sql, [phoneNumberId]);
  if (!rows.length) throw new Error("Unknown WhatsApp number (phone_number_id)");
  return rows[0].clinic_id;
}

async function logIncoming(clinicId, from, msg) {
  const sql = `
    INSERT INTO whatsapp_logs (clinic_id, direction, message_type, whatsapp_msg_id, to_from_number, payload)
    VALUES ($1, 'incoming', $2, $3, $4, $5)
    ON CONFLICT DO NOTHING
  `;
  await db.query(sql, [clinicId, msg.type || "text", msg.id || null, from, msg]);
}

async function logOutgoing(clinicId, to, payload, whatsapp_msg_id = null) {
  const sql = `
    INSERT INTO whatsapp_logs (clinic_id, direction, message_type, whatsapp_msg_id, to_from_number, payload)
    VALUES ($1, 'outgoing', $2, $3, $4)
  `;
  await db.query(sql, [clinicId, payload.type || "text", whatsapp_msg_id, to, payload]);
}

/**
 * sendMessage - calls Meta Cloud API for the clinic bot
 * message: already in Meta format excluding "to"; e.g.
 *   { type: "text", text: { body: "Hello" } }
 */
async function sendMessage({ clinicId, to, message }) {
  // fetch credentials
  const credSql = `SELECT phone_number_id, access_token_enc FROM whatsapp_credentials WHERE clinic_id=$1 LIMIT 1`;
  const credRes = await db.query(credSql, [clinicId]);
  if (!credRes.rows.length) throw new Error("WhatsApp credentials missing for clinic");
  const { phone_number_id, access_token_enc } = credRes.rows[0];

  // decrypt token (throws if invalid)
  const token = decryptText(access_token_enc);

  // build payload
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phone_number_id}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to,
    ...message
  };

  // call API
  const resp = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 10000
  });

  // log outgoing (includes returned wa msg id if present)
  const waMsgId = resp.data?.messages?.[0]?.id || null;
  await logOutgoing(clinicId, to, payload, waMsgId);

  return resp.data;
}

async function sendDocumentMessage({ clinicId, to, url, filename }) {
  const credSql = `SELECT phone_number_id, access_token_enc FROM whatsapp_credentials WHERE clinic_id=$1 LIMIT 1`;
  const credRes = await db.query(credSql, [clinicId]);

  if (!credRes.rows.length) throw new Error("WhatsApp credentials missing");

  const { phone_number_id, access_token_enc } = credRes.rows[0];
  const token = decryptText(access_token_enc);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "document",
    document: {
      link: url,
      filename
    }
  };

  const resp = await axios.post(
    `https://graph.facebook.com/${WA_API_VERSION}/${phone_number_id}/messages`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  return resp.data;
}

module.exports = {
  lookupClinicByPhoneNumberId,
  logIncoming,
  logOutgoing,
  sendMessage,
  sendDocumentMessage
};
