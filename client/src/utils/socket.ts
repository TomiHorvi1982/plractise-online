import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(username: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io('/', {
    auth: { username },
    transports: ['websocket', 'polling'],
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
