// Sends one WhatsApp message through n8n — or, on the factory PC, through the
// local relay (desktop/lib/alertRelay.js), which queues it and sends it when
// online. Never throws: alerts must not break the request that raised them.
// Resolves what actually happened (T1.8):
//   { ok: true, queued: true }    the factory relay stored it; it goes out later
//   { ok: true, queued: false }   n8n accepted it
//   { ok: false, error }          nothing was sent or queued
const sendWhatsApp = async (message) => {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ WhatsApp error: N8N_WEBHOOK_URL is not set');
    return { ok: false, error: 'N8N_WEBHOOK_URL is not set' };
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
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`n8n webhook responded with ${response.status}${text ? `: ${text.slice(0, 500)}` : ''}`);
    }
    let body = {};
    try { body = JSON.parse(text); } catch { /* not JSON */ }

    if (body.queued === true) {
      console.log('📥 WhatsApp alert queued on this PC:', message);
      return { ok: true, queued: true };
    }
    console.log('✅ WhatsApp alert sent to n8n:', message);
    return { ok: true, queued: false };
  } catch (error) {
    console.error('❌ WhatsApp error:', error.message);
    return { ok: false, error: error.message };
  }
};

module.exports = { sendWhatsApp };
