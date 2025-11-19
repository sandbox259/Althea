// src/middleware/requireRole.js
/**
 * Role-based Access Control Middleware
 * -------------------------------------------
 * Usage:
 *    router.post("/create", auth, requireRole("super_admin"), controller)
 *
 * If the logged-in user's role is not in the allowed list → block (403)
 */

module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: "Forbidden: insufficient permissions" });
    }

    next(); // User allowed
  };
};
