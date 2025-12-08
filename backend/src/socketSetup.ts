import { Server } from 'socket.io';
import { Server as HttpServer } from 'http'; // Import HttpServer type

export let io: Server;

export function initializeSocket(httpServer: HttpServer): Server {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || '*',
            methods: ['GET', 'POST'],
            credentials: true
        }
    });
    console.log('Socket.IO instance initialized in socketSetup.ts:', io ? 'OK' : 'Failed');
    return io;
}
