// src/routes/whatsapp.routes.js
const router = require("express").Router();
const ctrl = require("../controllers/whatsapp.controller");

// Meta webhook validation (GET)
router.get("/webhook", ctrl.verifyWebhook);

// Webhook entrypoint (POST)
router.post("/webhook", ctrl.handleWebhook);

module.exports = router;
