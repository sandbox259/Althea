// src/db/index.js
const { Pool } = require("pg");
const { dbUrl } = require("../config");

const pool = new Pool({
  connectionString: dbUrl,
  max: 20,              // max open connections
  idleTimeoutMillis: 30000
});

// We always export query() so code stays simple
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
