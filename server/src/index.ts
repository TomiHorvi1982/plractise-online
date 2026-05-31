import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { initDb, getDb, saveDb } from './db';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 50 * 1024 * 1024,
});

app.use(cors());

const PORT = parseInt(process.env.PORT || '3001', 10);

interface Room {
  id: string;
  users: Map<string, User>;
  backingTrackState: {
    playing: boolean;
    position: number;
    tempo: number;
    startedAt: number;
  };
}

interface User {
  id: string;
  username: string;
  roomId: string;
  joinedAt: number;
}

const rooms = new Map<string, Room>();

io.use((socket, next) => {
  const username = socket.handshake.auth.username as string;
  if (!username || username.length < 1 || username.length > 30) {
    return next(new Error('Invalid username'));
  }
  socket.data.username = username;
  next();
});

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.data.username} (${socket.id})`);

  // --- Room Management ---

  socket.on('create-room', (callback: (roomId: string) => void) => {
    const roomId = uuidv4().slice(0, 8);
    const room: Room = {
      id: roomId,
      users: new Map(),
      backingTrackState: {
        playing: false,
        position: 0,
        tempo: 120,
        startedAt: 0,
      },
    };
    rooms.set(roomId, room);
    console.log(`[room] created ${roomId} by ${socket.data.username}`);
    callback(roomId);
  });

  socket.on('join-room', (roomId: string, callback: (result: { success: boolean; error?: string; users?: string[] }) => void) => {
    const room = rooms.get(roomId);
    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }

    if (room.users.size >= 8) {
      return callback({ success: false, error: 'Room is full (max 8)' });
    }

    socket.join(roomId);
    socket.data.roomId = roomId;

    const user: User = {
      id: socket.id,
      username: socket.data.username,
      roomId,
      joinedAt: Date.now(),
    };
    room.users.set(socket.id, user);

    const existingUsers = Array.from(room.users.values())
      .filter((u) => u.id !== socket.id)
      .map((u) => u.username);

    callback({ success: true, users: existingUsers });

    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      username: socket.data.username,
    });

    socket.emit('backing-track-state', room.backingTrackState);

    console.log(`[room] ${socket.data.username} joined ${roomId}`);
  });

  socket.on('leave-room', () => {
    leaveRoom(socket);
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.data.username} (${socket.id})`);
    leaveRoom(socket);
  });

  function leaveRoom(socket: any) {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      room.users.delete(socket.id);
      socket.to(roomId).emit('user-left', socket.id);

      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`[room] deleted empty room ${roomId}`);
      }
    }
    socket.leave(roomId);
    socket.data.roomId = null;
  }

  // --- WebRTC Signaling ---

  socket.on('signal', (data: { to: string; signal: any }) => {
    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  socket.on('request-audio-stream', (targetId: string) => {
    io.to(targetId).emit('audio-stream-request', { from: socket.id });
  });

  // --- Backing Track Sync ---

  socket.on('backing-track-command', (data: { action: string; tempo?: number; position?: number }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const ts = Date.now();
    switch (data.action) {
      case 'play':
        room.backingTrackState.playing = true;
        room.backingTrackState.startedAt = ts;
        break;
      case 'stop':
        if (room.backingTrackState.playing) {
          room.backingTrackState.position += ts - room.backingTrackState.startedAt;
        }
        room.backingTrackState.playing = false;
        break;
      case 'tempo':
        if (data.tempo) {
          room.backingTrackState.tempo = data.tempo;
        }
        break;
      case 'seek':
        if (data.position !== undefined) {
          room.backingTrackState.position = data.position;
          room.backingTrackState.startedAt = ts;
        }
        break;
    }
    socket.to(roomId).emit('backing-track-state', room.backingTrackState);
  });

  // --- Chat ---

  socket.on('chat-message', (data: { text: string }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (!data.text || data.text.length > 2000) return;

    io.to(roomId).emit('chat-message', {
      id: uuidv4(),
      from: socket.id,
      username: socket.data.username,
      text: data.text,
      timestamp: Date.now(),
    });
  });

  // --- Audio Messages ---

  socket.on('audio-message', (data: { audioBuffer: ArrayBuffer; duration: number }) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    if (data.audioBuffer.byteLength > 10 * 1024 * 1024) return;

    socket.to(roomId).emit('audio-message', {
      id: uuidv4(),
      from: socket.id,
      username: socket.data.username,
      audioBuffer: data.audioBuffer,
      duration: data.duration,
      timestamp: Date.now(),
    });
  });

  // --- File Sharing ---

  socket.on('file-share', (data: { fileName: string; fileData: ArrayBuffer; fileType: string; fileSize: number }, callback: (success: boolean) => void) => {
    const roomId = socket.data.roomId;
    if (!roomId) {
      callback(false);
      return;
    }
    if (data.fileData.byteLength > 50 * 1024 * 1024) {
      callback(false);
      return;
    }

    const fileId = uuidv4();
    socket.to(roomId).emit('file-share', {
      id: fileId,
      from: socket.id,
      username: socket.data.username,
      fileName: data.fileName,
      fileType: data.fileType,
      fileSize: data.fileSize,
      fileData: data.fileData,
      timestamp: Date.now(),
    });
    callback(true);
  });

  // --- Voice Chat (separate channel via WebRTC) ---

  socket.on('voice-signal', (data: { to: string; signal: any }) => {
    io.to(data.to).emit('voice-signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  // --- Session Persistence ---

  socket.on('save-session', (data: { name: string; data: any }, callback: (result: { id?: string; error?: string }) => void) => {
    try {
      const id = uuidv4();
      const db = getDb();
      db.run(
        'INSERT INTO sessions (id, name, username, data) VALUES (?, ?, ?, ?)',
        [id, data.name, socket.data.username, JSON.stringify(data.data)]
      );
      saveDb();
      console.log(`[session] saved ${id} by ${socket.data.username}`);
      callback({ id });
    } catch (err: any) {
      console.error('[session] save error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('load-session', (data: { id: string }, callback: (result: { id?: string; data?: any; error?: string }) => void) => {
    try {
      const db = getDb();
      const stmt = db.prepare('SELECT id, name, data FROM sessions WHERE id = ?');
      stmt.bind([data.id]);
      if (!stmt.step()) {
        stmt.free();
        return callback({ error: 'Session not found' });
      }
      const row = stmt.getAsObject() as { id: string; name: string; data: string };
      stmt.free();
      const parsed = JSON.parse(row.data);
      callback({ id: row.id, data: parsed });
      console.log(`[session] loaded ${data.id} by ${socket.data.username}`);
    } catch (err: any) {
      console.error('[session] load error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('list-sessions', (callback: (list: { id: string; name: string; created_at: string }[]) => void) => {
    try {
      const db = getDb();
      const stmt = db.prepare('SELECT id, name, created_at FROM sessions ORDER BY updated_at DESC LIMIT 50');
      const rows: { id: string; name: string; created_at: string }[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as any);
      }
      stmt.free();
      callback(rows);
    } catch (err: any) {
      console.error('[session] list error:', err);
      callback([]);
    }
  });

  socket.on('delete-session', (data: { id: string }, callback?: (result: { success: boolean }) => void) => {
    try {
      const db = getDb();
      db.run('DELETE FROM sessions WHERE id = ?', [data.id]);
      saveDb();
      console.log(`[session] deleted ${data.id}`);
      if (callback) callback({ success: true });
    } catch (err: any) {
      console.error('[session] delete error:', err);
      if (callback) callback({ success: false });
    }
  });

  // --- Screen Sharing ---

  socket.on('screen-signal', (data: { to: string; signal: any }) => {
    io.to(data.to).emit('screen-signal', {
      from: socket.id,
      signal: data.signal,
    });
  });

  socket.on('screen-sharing-started', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('screen-sharing-started', socket.id);
  });

  socket.on('screen-sharing-stopped', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('screen-sharing-stopped', socket.id);
  });
});

if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

(async () => {
  await initDb();
  console.log('[server] database ready');

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] JamStream running on port ${PORT}`);
  });
})();
