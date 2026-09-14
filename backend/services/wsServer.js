// Minimal push channel for state that's already computed on the server —
// stock quantities changing from a sale, purchase, production completion, or
// manual edit. Deliberately not Socket.IO: one event type, one broadcast to
// everyone who's logged in, no rooms/namespaces needed at this app's scale.
// A browser's native WebSocket can't set custom headers, so the JWT travels
// as a query param on the upgrade request instead of an Authorization header
// (same token already sitting in localStorage for REST calls) — the
// tradeoff is it can land in access logs, acceptable for a short-lived token
// that's already used the same way for every other request.
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { URL } = require('url');

const clients = new Set();
let wss = null;

// Observed live: Cloudflare (or something in the tunnel path) closes an idle
// WebSocket after ~2.1 minutes with no traffic. Sending a ping well under
// that window keeps the connection counted as active — the ping/pong frames
// themselves are what reset whatever idle timer is closing it, regardless of
// whether any application event has actually fired. Browsers answer WS ping
// frames automatically at the protocol level, so no frontend change is needed.
const HEARTBEAT_INTERVAL_MS = 30000;

function initWebSocketServer(httpServer) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    let token;
    try {
      const { pathname, searchParams } = new URL(req.url, 'http://localhost');
      if (pathname !== '/ws') {
        socket.destroy();
        return;
      }
      token = searchParams.get('token');
      jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    } catch (err) {
      // socket.end() (not write() + destroy()) so the response actually
      // flushes before the connection closes — destroying right after write
      // can drop the bytes before a proxy in front of this (Cloudflare
      // Tunnel included) has read them, which surfaces as a 502 at the edge
      // instead of the 401 this is actually sending.
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.isAlive = true;
    console.log(`🔌 WS client connected (${clients.size} total)`);

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`🔌 WS client disconnected (${clients.size} total)`);
    });
    ws.on('error', () => clients.delete(ws));
  });

  // A client that doesn't answer one ping cycle is presumed dead (e.g. a
  // laptop lid closed without a clean close frame) and gets dropped instead
  // of lingering in `clients` forever.
  setInterval(() => {
    for (const ws of clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log('✅ WebSocket server attached at /ws');
}

// Fire-and-forget by nature — a dropped/slow client just misses a push and
// falls back to whatever poll/refetch the frontend already has as a safety
// net; nothing here should ever block or fail the HTTP request that triggered it.
function broadcast(event, payload) {
  if (!wss || clients.size === 0) return;
  const message = JSON.stringify({ event, payload });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  }
}

module.exports = { initWebSocketServer, broadcast };
