const db = require("../db");
const jwt = require("jsonwebtoken");
const { hashPassword, verifyPassword } = require("../utils/passwords");
const { jwtSecret, jwtExpires } = require("../config");

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const sql = `
      SELECT user_id, clinic_id, full_name, email, role, password_hash, is_active
      FROM app_users WHERE email=$1 LIMIT 1
    `;
    const { rows } = await db.query(sql, [email]);
    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        clinic_id: user.clinic_id,
        role: user.role,
        name: user.full_name
      },
      jwtSecret,
      { expiresIn: jwtExpires }
    );

    delete user.password_hash;

    return res.json({ token, user });
  } catch (err) {
    next(err);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { full_name, email, phone, role, password } = req.body;

    const passwordHash = password ? await hashPassword(password) : null;

    const sql = `
      INSERT INTO app_users (full_name, email, phone, role, password_hash, is_active)
      VALUES ($1,$2,$3,$4,$5,true)
      RETURNING user_id, full_name, email, phone, role
    `;
    const { rows } = await db.query(sql, [
      full_name, email, phone, role, passwordHash
    ]);

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
};
