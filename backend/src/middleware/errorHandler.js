// src/middleware/errorHandler.js
/**
 * Global Error Handler
 * -------------------------------------------
 * Catches errors thrown inside controllers or services.
 * Sends user-friendly JSON responses.
 */

module.exports = function errorHandler(err, req, res, next) {
  console.error("🔥 Error:", err);

  // Special handling for PostgreSQL constraint errors
  if (err.constraint === "no_overlap_per_doctor") {
    return res.status(409).json({
      error: "Appointment overlaps with another booking"
    });
  }

  return res.status(500).json({
    error: "Internal Server Error"
  });
};
