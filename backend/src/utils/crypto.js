// src/utils/crypto.js
// AES-256-GCM encrypt/decrypt helpers using WHATSAPP_MASTER_KEY from .env

const crypto = require("crypto");

const MASTER_KEY = process.env.WHATSAPP_MASTER_KEY || ""; // MUST be exactly 32 bytes
const ALGO = "aes-256-gcm";

if (!MASTER_KEY || Buffer.from(MASTER_KEY).length !== 32) {
  console.error("FATAL: WHATSAPP_MASTER_KEY must be set in .env and 32 bytes long.");
  // We don't exit here to allow local linting, but in production you should fail fast.
}

/**
 * Encrypt plain text -> base64(iv + ciphertext + tag)
 */
function encryptText(plain) {
  const key = Buffer.from(MASTER_KEY);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const out = Buffer.concat([iv, encrypted, tag]).toString("base64");
  return out;
}

/**
 * Decrypt base64(iv + ciphertext + tag) -> plain text
 */
function decryptText(enc) {
  if (!enc) throw new Error("No encrypted text provided");
  const key = Buffer.from(MASTER_KEY);
  const data = Buffer.from(enc, "base64");
  const iv = data.slice(0, 12);
  const tag = data.slice(data.length - 16);
  const ciphertext = data.slice(12, data.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encryptText, decryptText };
