import { createContext, useContext, useEffect, useRef } from 'react';
import { AUTH_BASE_URL } from '../config';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// /ws is mounted at the server root (like /auth), not under /api — same
// reasoning as AUTH_BASE_URL in config.js.
const WS_BASE_URL = AUTH_BASE_URL.replace(/^http/, 'ws');

const RECONNECT_DELAY_MS = 3000;

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map()); // event -> Set<handler>
  const reconnectTimerRef = useRef(null);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      return;
    }

    closedByUsRef.current = false;

    const connect = () => {
      const ws = new WebSocket(`${WS_BASE_URL}/ws?token=${encodeURIComponent(token)}`);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        let parsed;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const handlers = listenersRef.current.get(parsed.event);
        if (handlers) {
          handlers.forEach((handler) => handler(parsed.payload));
        }
      };

      // No exponential backoff — this is a best-effort push channel with a
      // polling/refetch fallback wherever it's consumed, so a fixed 3s retry
      // is simple and enough; nothing depends on the socket alone.
      ws.onclose = () => {
        if (closedByUsRef.current) return;
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
    };
  }, [token]);

  const subscribe = (event, handler) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(handler);
    return () => listenersRef.current.get(event)?.delete(handler);
  };

  return (
    <SocketContext.Provider value={{ subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
