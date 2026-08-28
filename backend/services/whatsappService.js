const sendWhatsApp = async (message) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ WhatsApp error: N8N_WEBHOOK_URL is not set');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
