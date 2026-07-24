"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SitOutManager = void 0;
const client_1 = require("../database/client");
class SitOutManager {
    static async sitOut(userId, tableId) {
        const seat = await client_1.prisma.seat.findFirst({ where: { userId } });
        if (!seat)
            throw new Error('Seat not found');
        await client_1.prisma.sittingOutPlayer.create({
            data: { userId, tableId, seatId: seat.id }
        });
    }
    static async isSittingOut(userId) {
        const entry = await client_1.prisma.sittingOutPlayer.findFirst({
            where: { userId }
        });
        return !!entry;
    }
    static async returnToGame(userId) {
        await client_1.prisma.sittingOutPlayer.deleteMany({ where: { userId } });
    }
    static async removeSittingOutForHand(tableId) {
        await client_1.prisma.sittingOutPlayer.deleteMany({ where: { tableId } });
    }
}
exports.SitOutManager = SitOutManager;
