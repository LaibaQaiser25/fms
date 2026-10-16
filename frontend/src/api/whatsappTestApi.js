import http from './http';

// Factory app only (Owner): one WhatsApp message straight through n8n, with the real outcome.
export const sendTestWhatsApp = () => http.post('/whatsapp-test');
