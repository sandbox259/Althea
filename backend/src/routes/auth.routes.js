const router = require("express").Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const authController = require("../controllers/auth.controller");

router.post(
  "/login",
  [
    body("email").isEmail(),
    body("password").isString().isLength({ min: 6 })
  ],
  validate,
  authController.login
);

router.post(
  "/create-user",
  [
    body("full_name").notEmpty(),
    body("role").isIn(["super_admin", "clinic_admin", "staff", "doctor"]),
    body("password").optional().isLength({ min: 6 })
  ],
  validate,
  authController.createUser
);

module.exports = router;
