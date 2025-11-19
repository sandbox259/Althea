const bcrypt = require("bcryptjs");
const { bcryptRounds } = require("../config");

async function hashPassword(plain) {
  return bcrypt.hash(plain, bcryptRounds);
}

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, verifyPassword };
