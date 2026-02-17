const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname)));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

const rooms = new Map();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/room', (req, res) => {
  res.sendFile(path.join(__dirname, 'room.html'));
});

app.get('/room/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'room.html'));
});

app.get('/api/room-exists/:code', (req, res) => {
  const code = req.params.code;
  const exists = rooms.has(code);
  res.json({ exists });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomCode, username } = data;
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.username = username;

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, {
        users: new Map(),
        canvasHistory: [],
        createdAt: Date.now()
      });
    }

    const room = rooms.get(roomCode);
    room.users.set(socket.id, {
      id: socket.id,
      username: username,
      color: getRandomColor()
    });

    // Send existing canvas history to new user
    socket.emit('canvas-history', room.canvasHistory);

    // Notify others
    const usersList = Array.from(room.users.values());
    io.to(roomCode).emit('users-updated', usersList);
    socket.to(roomCode).emit('user-joined', {
      username: username,
      id: socket.id
    });

    console.log(`${username} joined room ${roomCode}`);
  });

  socket.on('draw', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.canvasHistory.push(data);

      // Keep history manageable
      if (room.canvasHistory.length > 50000) {
        room.canvasHistory = room.canvasHistory.slice(-30000);
      }

      socket.to(roomCode).emit('draw', data);
    }
  });

  socket.on('draw-batch', (dataArray) => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.canvasHistory.push(...dataArray);

      if (room.canvasHistory.length > 50000) {
        room.canvasHistory = room.canvasHistory.slice(-30000);
      }

      socket.to(roomCode).emit('draw-batch', dataArray);
    }
  });

  socket.on('clear-canvas', () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      rooms.get(roomCode).canvasHistory = [];
      io.to(roomCode).emit('clear-canvas');
    }
  });

  socket.on('undo-request', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      // Remove strokes belonging to the requesting user's last stroke
      const userId = socket.id;
      let lastStrokeId = null;
      for (let i = room.canvasHistory.length - 1; i >= 0; i--) {
        if (room.canvasHistory[i].odrawerId === userId) {
          lastStrokeId = room.canvasHistory[i].strokeId;
          break;
        }
      }
      if (lastStrokeId) {
        room.canvasHistory = room.canvasHistory.filter(d => d.strokeId !== lastStrokeId);
        io.to(roomCode).emit('full-redraw', room.canvasHistory);
      }
    }
  });

  socket.on('voice-signal', (data) => {
    const { to, signal } = data;
    io.to(to).emit('voice-signal', {
      from: socket.id,
      signal: signal
    });
  });

  socket.on('cursor-move', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      socket.to(roomCode).emit('cursor-move', {
        id: socket.id,
        username: socket.username,
        x: data.x,
        y: data.y
      });
    }
  });

  socket.on('chat-message', (data) => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      io.to(roomCode).emit('chat-message', {
        username: socket.username,
        message: data.message,
        timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode && rooms.has(roomCode)) {
      const room = rooms.get(roomCode);
      room.users.delete(socket.id);

      if (room.users.size === 0) {
        // Keep room alive for 5 minutes after last user leaves
        setTimeout(() => {
          if (rooms.has(roomCode) && rooms.get(roomCode).users.size === 0) {
            rooms.delete(roomCode);
            console.log(`Room ${roomCode} deleted (empty)`);
          }
        }, 300000);
      }

      const usersList = Array.from(room.users.values());
      io.to(roomCode).emit('users-updated', usersList);
      io.to(roomCode).emit('user-left', {
        username: socket.username,
        id: socket.id
      });
    }
    console.log('User disconnected:', socket.id);
  });
});

function getRandomColor() {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`PaintWithBuddy running on port ${PORT}`);
});

module.exports = app;