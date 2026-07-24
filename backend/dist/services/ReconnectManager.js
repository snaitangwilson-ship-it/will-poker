"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconnectManager = void 0;
const client_1 = require("../database/client");
const index_1 = require("../index");
class ReconnectManager {
    constructor() {
        this.reconnectTimers = new Map();
    }
    static getInstance() {
        if (!ReconnectManager.instance) {
            ReconnectManager.instance = new ReconnectManager();
        }
        return ReconnectManager.instance;
    }
    async saveGameState(gameId, state) {
        try {
            await index_1.redis.setex(`game:${gameId}`, 3600, JSON.stringify(state));
            await client_1.prisma.gameState.upsert({
                where: { gameId },
                update: { state, updatedAt: new Date() },
                create: { gameId, tableId: state.tableId, state }
            });
        }
        catch (error) {
            console.error('[RECONNECT] Failed to save state:', error);
        }
    }
    async restoreGameState(gameId) {
        try {
            const cached = await index_1.redis.get(`game:${gameId}`);
            if (cached)
                return JSON.parse(cached);
            const dbState = await client_1.prisma.gameState.findUnique({ where: { gameId } });
            return dbState?.state || null;
        }
        catch (error) {
            console.error('[RECONNECT] Failed to restore state:', error);
            return null;
        }
    }
    async reconnectPlayer(userId, gameId) {
        const state = await this.restoreGameState(gameId);
        if (!state)
            return false;
        const player = state.players?.find((p) => p.userId === userId);
        if (!player)
            return false;
        await client_1.prisma.seatReservation.deleteMany({
            where: { userId, tableId: state.tableId }
        });
        const timerKey = `reconnect:${userId}:${gameId}`;
        if (this.reconnectTimers.has(timerKey)) {
            clearTimeout(this.reconnectTimers.get(timerKey));
            this.reconnectTimers.delete(timerKey);
        }
        return true;
    }
    async reserveSeat(tableId, userId, seatId) {
        const expiresAt = new Date(Date.now() + 120000);
        await client_1.prisma.seatReservation.upsert({
            where: { tableId_userId: { tableId, userId } },
            update: { expiresAt, seatId },
            create: { tableId, userId, seatId, expiresAt }
        });
        const timerKey = `reconnect:${userId}:${tableId}`;
        if (this.reconnectTimers.has(timerKey)) {
            clearTimeout(this.reconnectTimers.get(timerKey));
        }
        this.reconnectTimers.set(timerKey, setTimeout(async () => {
            await this.expireReservation(tableId, userId);
            this.reconnectTimers.delete(timerKey);
        }, 120000));
    }
    async expireReservation(tableId, userId) {
        await client_1.prisma.seatReservation.deleteMany({
            where: { tableId, userId }
        });
        console.log(`[RECONNECT] Reservation expired for user ${userId} at table ${tableId}`);
    }
    async isSeatReserved(tableId, userId) {
        const reservation = await client_1.prisma.seatReservation.findUnique({
            where: { tableId_userId: { tableId, userId } }
        });
        if (!reservation)
            return false;
        if (reservation.expiresAt < new Date()) {
            await this.expireReservation(tableId, userId);
            return false;
        }
        return true;
    }
}
exports.ReconnectManager = ReconnectManager;
