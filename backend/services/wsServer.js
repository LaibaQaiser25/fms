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
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log(`🔌 WS client connected (${clients.size} total)`);

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`🔌 WS client disconnected (${clients.size} total)`);
    });
    ws.on('error', () => clients.delete(ws));
  });

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
