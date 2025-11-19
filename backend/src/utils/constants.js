// src/utils/constants.js

/**
 * Global constants used across the backend.
 * ------------------------------------------
 * Right now we only store roles here,
 * but later you can add statuses, enums, etc.
 */

const ROLES = {
  SUPER: "super_admin",
  CLINIC_ADMIN: "clinic_admin",
  STAFF: "staff",
  DOCTOR: "doctor"
};

module.exports = {
  ROLES
};
