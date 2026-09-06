#!/usr/bin/env bash
# Go-live for api.<domain> + n8n.<domain> via Cloudflare named tunnel.
#
# PREREQUISITES (owner does these first):
#   1. Register the domain on Cloudflare (done: ittefaqbuilder.com) — it is
#      automatically on Cloudflare DNS, nothing to set up.
#   2. Authorize this VPS:  cloudflared tunnel login
#      (opens a browser URL — pick the domain) so ~/.cloudflared/cert.pem exists.
#
# Then run:  bash deploy/go-live-named-tunnel.sh [domain]
set -euo pipefail

DOMAIN="${1:-ittefaqbuilder.com}"
BACKEND_HOST="api.${DOMAIN}"
N8N_HOST="n8n.${DOMAIN}"
TUNNEL_NAME="fms"

cd "$(dirname "$0")/.."

echo "==> Verifying cloudflared is logged in (cert.pem present)"
if [ ! -f ~/.cloudflared/cert.pem ]; then
  echo "ERROR: ~/.cloudflared/cert.pem not found. Run: cloudflared tunnel login"
  exit 1
fi

echo "==> Creating named tunnel '${TUNNEL_NAME}' (idempotent)"
if ! cloudflared tunnel list | grep -q "${TUNNEL_NAME}"; then
  cloudflared tunnel create "${TUNNEL_NAME}"
else
  echo "    tunnel already exists"
fi

# `cloudflared tunnel create` writes credentials to a UUID-named file
# (~/.cloudflared/<tunnel-id>.json). Symlink the expected name to it so the
# config below (and /etc/cloudflared/config.yml after `service install`) work.
CRED_FILE="$(ls -t ~/.cloudflared/*.json | grep -v cert | head -1)"
if [ -n "${CRED_FILE}" ] && [ ! -e ~/.cloudflared/${TUNNEL_NAME}.json ]; then
  ln -s "$(basename "${CRED_FILE}")" ~/.cloudflared/${TUNNEL_NAME}.json
  echo "    linked credentials: ${TUNNEL_NAME}.json -> $(basename "${CRED_FILE}")"
fi

echo "==> Writing tunnel config to ~/.cloudflared/${TUNNEL_NAME}.yml"
cat > ~/.cloudflared/${TUNNEL_NAME}.yml <<EOF
tunnel: ${TUNNEL_NAME}
credentials-file: ${HOME}/.cloudflared/${TUNNEL_NAME}.json

ingress:
  - hostname: ${BACKEND_HOST}
    service: http://localhost:5000
  - hostname: ${N8N_HOST}
    service: http://localhost:5678
  - service: http_status:404
EOF

echo "==> Adding DNS routes (idempotent)"
cloudflared tunnel route dns "${TUNNEL_NAME}" "${BACKEND_HOST}" || true
cloudflared tunnel route dns "${TUNNEL_NAME}" "${N8N_HOST}" || true

echo "==> Installing cloudflared systemd service"
sudo cloudflared --config /home/myuser/.cloudflared/${TUNNEL_NAME}.yml service install
sudo systemctl enable --now cloudflared
sudo systemctl restart cloudflared
for i in $(seq 1 15); do
  systemctl is-active cloudflared >/dev/null 2>&1 && break
  [ "$i" = 15 ] && { echo "ERROR: cloudflared not active"; systemctl status cloudflared --no-pager | tail -15; exit 1; }
  sleep 1
done
sudo systemctl status cloudflared --no-pager | head -8

echo "==> Updating n8n public webhook URL"
sed -i "s|^N8N_PUBLIC_URL=.*|N8N_PUBLIC_URL=https://${N8N_HOST}/|" .env || true
sg docker -c "docker compose up -d n8n" >/dev/null 2>&1 || true

echo
echo "============================================================"
echo " DONE. Public endpoints:"
echo "   Backend: https://${BACKEND_HOST}"
echo "   n8n:     https://${N8N_HOST}"
echo
echo " NEXT (Vercel): set frontend env and redeploy"
echo "   VITE_API_URL=https://${BACKEND_HOST}/api"
echo "   (Vercel dashboard -> project -> Settings -> Environment"
echo "    Variables -> add VITE_API_URL -> Redeploy)"
echo
echo " Also verify:"
echo "   curl https://${BACKEND_HOST}/auth/login  (expect 401, not 502)"
echo "   Twilio console: point the WhatsApp message webhook at"
echo "   https://${N8N_HOST}/webhook/twilio-incoming"
echo "============================================================"
