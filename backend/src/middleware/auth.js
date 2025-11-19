// src/middleware/auth.js
/**
 * JWT Authentication Middleware
 * -------------------------------------------
 * This middleware checks:
 * - If Authorization header contains a Bearer token
 * - Verifies the token using JWT_SECRET
 * - Attaches the decoded user payload to req.user
 *
 * If the token is missing or invalid → request is blocked (401)
 */

const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config");

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization;

  // If no Authorization header → block
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  const token = header.split(" ")[1];

  try {
    // Decode token
    const user = jwt.verify(token, jwtSecret);

    // Attach decoded payload to req.user
    req.user = user;

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
