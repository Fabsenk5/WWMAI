import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
export declare let io: Server;
export declare function initializeSocket(httpServer: HttpServer): Server;
