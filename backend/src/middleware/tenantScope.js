// src/middleware/tenantScope.js
/**
 * Tenant Scope Middleware (Multi-Clinic)
 * -------------------------------------------
 * Determines which clinic's data the current user can access.
 *
 * super_admin:
 *    - Can access any clinic by sending:  x-clinic-id: <clinic_id>
 *    - If not provided, they have no clinic scope (can list all)
 *
 * Other roles:
 *    - Must use their own clinic_id from JWT
 *
 * Attached as: req.tenant = { clinic_id }
 */

module.exports = function tenantScope(req, res, next) {
  const user = req.user;

  // Case 1: super admin
  if (user.role === "super_admin") {
    const clinicHeader = req.headers["x-clinic-id"];

    req.tenant = {
      clinic_id: clinicHeader ? Number(clinicHeader) : null
    };

    return next();
  }

  // Case 2: normal clinic users
  if (!user.clinic_id) {
    return res.status(400).json({
      error: "No clinic assigned to this user"
    });
  }

  req.tenant = {
    clinic_id: Number(user.clinic_id)
  };

  next();
};
