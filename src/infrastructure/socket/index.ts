// src/infrastructure/socket/index.ts

import { Server } from 'socket.io';

export let io: Server;

export function initializeSocket(server: any): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);


      socket.on("job:join", ({ jobId }) => {
           socket.join(`job:${jobId}`);

          console.log(
            `Socket ${socket.id} joined room job:${jobId}`
          );
        });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocket(): Server {
  if (!io) {
    throw new Error('Socket.IO has not been initialized');
  }

  return io;
}