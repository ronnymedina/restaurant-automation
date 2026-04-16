import { io, type Socket } from 'socket.io-client';

const WS_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

export function createDashboardSocket(token: string): Socket {
  return io(WS_URL, { auth: { token }, transports: ['websocket'], reconnection: true });
}

export function createKitchenSocket(kitchenToken: string, slug: string): Socket {
  return io(WS_URL, {
    auth: { kitchenToken, slug },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });
}
