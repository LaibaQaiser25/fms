const sendWhatsApp = async (message) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ WhatsApp error: N8N_WEBHOOK_URL is not set');
    return;
  }

  // Shared secret checked by the n8n Webhook node's header auth — without it
  // n8n rejects the request with 403 and no alert is sent.
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.N8N_WEBHOOK_SECRET) {
    headers['X-FMS-Secret'] = process.env.N8N_WEBHOOK_SECRET;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`n8n webhook responded with ${response.status}`);
    }

    console.log('✅ WhatsApp alert sent to n8n:', message);
  } catch (error) {
    console.error('❌ WhatsApp error:', error.message);
  }
};

module.exports = { sendWhatsApp };
