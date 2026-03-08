import { io, type Socket } from 'socket.io-client';

const WS_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

export function createKioskSocket(slug: string): Socket {
  return io(WS_URL, { query: { slug }, transports: ['websocket'], reconnection: true });
}
