"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplaySystem = void 0;
const client_1 = require("../../database/client");
const logger_1 = require("../../utils/logger");
class ReplaySystem {
    static async storeHand(gameId) {
        try {
            const game = await client_1.prisma.game.findUnique({
                where: { id: gameId },
                include: {
                    players: {
                        include: { user: true }
                    },
                    actions: {
                        orderBy: { timestamp: 'asc' }
                    }
                }
            });
            if (!game) {
                throw new Error('Game not found');
            }
            const replay = {
                id: `replay_${Date.now()}`,
                gameId: game.id,
                tableId: game.tableId,
                dealer: game.players.find(p => p.position === 0)?.userId || '',
                blinds: { small: game.stakes / 2, big: game.stakes },
                holeCards: game.players.map(p => ({
                    userId: p.userId,
                    cards: JSON.parse(p.holeCards || '[]')
                })),
                communityCards: JSON.parse(game.communityCards || '[]'),
                actions: game.actions.map(a => ({
                    userId: a.userId,
                    action: a.actionType.toLowerCase(),
                    amount: a.amount,
                    timestamp: a.timestamp
                })),
                potGrowth: [],
                winner: game.winnerId || '',
                handStrength: '',
                createdAt: new Date()
            };
            await client_1.prisma.handReplay.create({
                data: {
                    id: replay.id,
                    gameId: replay.gameId,
                    tableId: replay.tableId,
                    data: JSON.stringify(replay)
                }
            });
            logger_1.logger.info(`Hand replay stored: ${replay.id}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to store hand replay:', error);
        }
    }
    static async getReplay(replayId) {
        const replay = await client_1.prisma.handReplay.findUnique({
            where: { id: replayId }
        });
        if (!replay) {
            return null;
        }
        return JSON.parse(replay.data);
    }
    static async getReplaysByUser(userId, limit = 20) {
        const replays = await client_1.prisma.handReplay.findMany({
            where: {
                data: {
                    path: '$.holeCards[*].userId',
                    equals: userId
                }
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        return replays.map(r => JSON.parse(r.data));
    }
}
exports.ReplaySystem = ReplaySystem;
