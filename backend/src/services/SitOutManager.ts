import { prisma } from '../database/client';

export class SitOutManager {
  static async sitOut(userId: string, tableId: string): Promise<void> {
    const seat = await prisma.seat.findFirst({ where: { userId } });
    if (!seat) throw new Error('Seat not found');
    await prisma.sittingOutPlayer.create({
      data: { userId, tableId, seatId: seat.id }
    });
  }

  static async isSittingOut(userId: string): Promise<boolean> {
    const entry = await prisma.sittingOutPlayer.findFirst({
      where: { userId }
    });
    return !!entry;
  }

  static async returnToGame(userId: string): Promise<void> {
    await prisma.sittingOutPlayer.deleteMany({ where: { userId } });
  }

  static async removeSittingOutForHand(tableId: string): Promise<void> {
    await prisma.sittingOutPlayer.deleteMany({ where: { tableId } });
  }
}