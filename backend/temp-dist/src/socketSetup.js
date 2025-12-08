"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = void 0;
exports.initializeSocket = initializeSocket;
const socket_io_1 = require("socket.io");
function initializeSocket(httpServer) {
    exports.io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*', // Adjust as needed for your security requirements
            methods: ['GET', 'POST']
        }
    });
    console.log('Socket.IO instance initialized in socketSetup.ts:', exports.io ? 'OK' : 'Failed');
    return exports.io;
}
