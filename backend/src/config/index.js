// src/config/index.js
require("dotenv").config();

module.exports = {
  port: process.env.PORT || 4000,
  dbUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES || "7d",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10)
};
