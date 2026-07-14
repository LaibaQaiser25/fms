const twilio = require('twilio');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendWhatsApp = async (message) => {
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: process.env.OWNER_WHATSAPP,
      body: message
    });
    console.log('✅ WhatsApp sent:', message);
  } catch (error) {
    console.error('❌ WhatsApp error:', error.message);
  }
};

module.exports = { sendWhatsApp };