import { prisma } from '../database/client';
import { redis } from '../index';

export class ReconnectManager {
  private static instance: ReconnectManager;
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  static getInstance(): ReconnectManager {
    if (!ReconnectManager.instance) {
      ReconnectManager.instance = new ReconnectManager();
    }
    return ReconnectManager.instance;
  }

  async saveGameState(gameId: string, state: any): Promise<void> {
    try {
      await redis.setex(`game:${gameId}`, 3600, JSON.stringify(state));
      await prisma.gameState.upsert({
        where: { gameId },
        update: { state, updatedAt: new Date() },
        create: { gameId, tableId: state.tableId, state }
      });
    } catch (error) {
      console.error('[RECONNECT] Failed to save state:', error);
    }
  }

  async restoreGameState(gameId: string): Promise<any | null> {
    try {
      const cached = await redis.get(`game:${gameId}`);
      if (cached) return JSON.parse(cached);
      const dbState = await prisma.gameState.findUnique({ where: { gameId } });
      return dbState?.state || null;
    } catch (error) {
      console.error('[RECONNECT] Failed to restore state:', error);
      return null;
    }
  }

  async reconnectPlayer(userId: string, gameId: string): Promise<boolean> {
    const state = await this.restoreGameState(gameId);
    if (!state) return false;
    const player = state.players?.find((p: any) => p.userId === userId);
    if (!player) return false;

    await prisma.seatReservation.deleteMany({
      where: { userId, tableId: state.tableId }
    });

    const timerKey = `reconnect:${userId}:${gameId}`;
    if (this.reconnectTimers.has(timerKey)) {
      clearTimeout(this.reconnectTimers.get(timerKey)!);
      this.reconnectTimers.delete(timerKey);
    }
    return true;
  }

  async reserveSeat(tableId: string, userId: string, seatId: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 120000);
    await prisma.seatReservation.upsert({
      where: { tableId_userId: { tableId, userId } },
      update: { expiresAt, seatId },
      create: { tableId, userId, seatId, expiresAt }
    });

    const timerKey = `reconnect:${userId}:${tableId}`;
    if (this.reconnectTimers.has(timerKey)) {
      clearTimeout(this.reconnectTimers.get(timerKey)!);
    }

    this.reconnectTimers.set(timerKey, setTimeout(async () => {
      await this.expireReservation(tableId, userId);
      this.reconnectTimers.delete(timerKey);
    }, 120000));
  }

  async expireReservation(tableId: string, userId: string): Promise<void> {
    await prisma.seatReservation.deleteMany({
      where: { tableId, userId }
    });
    console.log(`[RECONNECT] Reservation expired for user ${userId} at table ${tableId}`);
  }

  async isSeatReserved(tableId: string, userId: string): Promise<boolean> {
    const reservation = await prisma.seatReservation.findUnique({
      where: { tableId_userId: { tableId, userId } }
    });
    if (!reservation) return false;
    if (reservation.expiresAt < new Date()) {
      await this.expireReservation(tableId, userId);
      return false;
    }
    return true;
  }
}