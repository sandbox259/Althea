// src/middleware/validate.js
/**
 * Validation Middleware
 * -------------------------------------------
 * Used after express-validator checks.
 * If any validation errors exist → return 422 Unprocessable Entity
 */

const { validationResult } = require("express-validator");

module.exports = function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      errors: errors.array()
    });
  }

  next();
};
