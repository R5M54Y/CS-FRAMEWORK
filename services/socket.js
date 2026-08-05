'use strict';

const { Server } = require('socket.io');
const sessionManager = require('../core/session-manager');
const config = require('../config');
const { getQueue } = require('./ai-queue');

let io = null;

function setupSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Send current sessions on connect
    socket.emit('sessions', sessionManager.getAllSessions());

    // Join session-specific room
    socket.on('join-session', (sessionId) => {
      socket.join(`session:${sessionId}`);
      console.log(`Socket ${socket.id} joined session:${sessionId}`);
    });

    socket.on('leave-session', (sessionId) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // Listen to session manager events and broadcast
  sessionManager.on('status', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:status', data);
    io.emit('sessions', sessionManager.getAllSessions()); // Broadcast updated list
  });

  sessionManager.on('qr', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:qr', data);
  });

  sessionManager.on('ready', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:ready', data);
  });

  sessionManager.on('message', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:message', data);
  });

  sessionManager.on('sent', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:sent', data);
  });

  sessionManager.on('error', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:error', data);
  });

  sessionManager.on('created', (data) => {
    io.emit('session:created', data);
    // Auto-refresh session list
    io.emit('sessions', sessionManager.getAllSessions());
  });

  sessionManager.on('deleted', (data) => {
    io.emit('session:deleted', data);
    io.emit('sessions', sessionManager.getAllSessions());
  });

  sessionManager.on('loggedOut', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:loggedOut', data);
  });

  // Bot state changes
  sessionManager.on('bot:state', (data) => {
    io.to(`session:${data.sessionId}`).emit('bot:state', data);
  });

  // Messages cleared
  sessionManager.on('messages-cleared', (data) => {
    io.to(`session:${data.sessionId}`).emit('session:messages-cleared', data);
  });

  // AI Queue stats broadcast every 2s
  setInterval(() => {
    const queue = getQueue();
    if (queue) {
      io.emit('queue:stats', queue.getStats());
    }
  }, 2000);

  return io;
}

function getIO() {
  return io;
}

module.exports = { setupSocketIO, getIO };