"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketIO = initializeSocketIO;
const socket_io_1 = require("socket.io");
const client_1 = require("../../database/client");
const logger_1 = require("../../utils/logger");
const security_1 = require("../../utils/security");
function initializeSocketIO(server) {
    const io = new socket_io_1.Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || '*',
            credentials: true
        },
        transports: ['websocket', 'polling']
    });
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                return next(new Error('Authentication required'));
            }
            const payload = security_1.SecurityUtils.verifyToken(token);
            if (!payload) {
                return next(new Error('Invalid token'));
            }
            socket.data.userId = payload.userId;
            next();
        }
        catch (error) {
            next(new Error('Authentication failed'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        logger_1.logger.info(`Player connected: ${socket.id} (User: ${userId})`);
        socket.on('lobby:join', async () => {
            try {
                const tables = await client_1.prisma.pokerTable.findMany({
                    include: { seats: { where: { isSitting: true } } }
                });
                socket.emit('lobby:tables', tables);
            }
            catch (error) {
                logger_1.logger.error('Lobby error:', error);
            }
        });
        socket.on('game:action', async (data) => {
            try {
                const { gameId, action, amount } = data;
                // Forward to game engine
                io.to(`game:${gameId}`).emit('game:action', {
                    userId,
                    action,
                    amount,
                    timestamp: Date.now()
                });
            }
            catch (error) {
                logger_1.logger.error('Game action error:', error);
                socket.emit('game:error', { message: String(error) });
            }
        });
        socket.on('chat:message', async (data) => {
            try {
                const { tableId, message } = data;
                io.to(`table:${tableId}`).emit('chat:message', {
                    userId,
                    userName: socket.data.userName || 'Player',
                    message,
                    timestamp: Date.now()
                });
            }
            catch (error) {
                logger_1.logger.error('Chat error:', error);
            }
        });
        socket.on('join:table', (tableId) => {
            socket.join(`table:${tableId}`);
            socket.join(`game:${tableId}`);
            logger_1.logger.info(`Socket ${socket.id} joined table ${tableId}`);
        });
        socket.on('leave:table', (tableId) => {
            socket.leave(`table:${tableId}`);
            socket.leave(`game:${tableId}`);
            logger_1.logger.info(`Socket ${socket.id} left table ${tableId}`);
        });
        socket.on('disconnect', () => {
            logger_1.logger.info(`Player disconnected: ${socket.id} (User: ${userId})`);
        });
    });
    return io;
}
