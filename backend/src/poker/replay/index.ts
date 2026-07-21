import { prisma } from '../../database/client';
import { logger } from '../../utils/logger';

export interface HandReplay {
  id: string;
  gameId: string;
  tableId: string;
  dealer: string;
  blinds: { small: number; big: number };
  holeCards: { userId: string; cards: string[] }[];
  communityCards: string[];
  actions: { userId: string; action: string; amount?: number; timestamp: Date }[];
  potGrowth: { timestamp: Date; amount: number }[];
  winner: string;
  handStrength: string;
  createdAt: Date;
}

export class ReplaySystem {
  static async storeHand(gameId: string): Promise<void> {
    try {
      const game = await prisma.game.findUnique({
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

      const replay: HandReplay = {
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

      await prisma.handReplay.create({
        data: {
          id: replay.id,
          gameId: replay.gameId,
          tableId: replay.tableId,
          data: JSON.stringify(replay)
        }
      });

      logger.info(`Hand replay stored: ${replay.id}`);
    } catch (error) {
      logger.error('Failed to store hand replay:', error);
    }
  }

  static async getReplay(replayId: string): Promise<HandReplay | null> {
    const replay = await prisma.handReplay.findUnique({
      where: { id: replayId }
    });

    if (!replay) {
      return null;
    }

    return JSON.parse(replay.data);
  }

  static async getReplaysByUser(userId: string, limit: number = 20): Promise<HandReplay[]> {
    const replays = await prisma.handReplay.findMany({
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
