const whatsappService = require("../services/whatsapp.service");
const conversation = require("../services/conversation.service");

exports.verifyWebhook = (req, res) => {
  // Meta webhook verification
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

exports.handleWebhook = async (req, res, next) => {
  try {
    const body = req.body;

    if (!body.entry?.[0]?.changes?.[0]?.value) {
      return res.sendStatus(200);
    }

    const value = body.entry[0].changes[0].value;

    const phoneNumberId = value.metadata.phone_number_id;
    const msg = value.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text?.body || "";

    // 1. Identify clinic
    const clinicId = await whatsappService.lookupClinicByPhoneNumberId(
      phoneNumberId
    );

    // 2. Log incoming message
    await whatsappService.logIncoming(clinicId, from, msg);

    // 3. Pass to conversation engine
    const reply = await conversation.processIncoming({
      clinicId,
      from,
      text,
      msg
    });

    // 4. Send reply through WhatsApp API (and log it)
    if (reply) {
      await whatsappService.sendMessage({
        clinicId,
        to: from,
        message: reply
      });
    }

    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
};
