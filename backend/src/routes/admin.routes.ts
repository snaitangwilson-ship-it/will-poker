import { Router } from 'express';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const router = Router();

router.get('/stats', async (req, res) => {
  try {
    const [users, tables, games, seats, rake] = await Promise.all([
      prisma.user.count(),
      prisma.pokerTable.count(),
      prisma.game.count(),
      prisma.seat.count({ where: { isSitting: true } }),
      prisma.walletTransaction.aggregate({
        where: { type: 'RAKE' },
        _sum: { amount: true }
      })
    ]);

    res.json({
      totalUsers: users,
      totalTables: tables,
      totalGames: games,
      playersOnline: seats,
      totalRake: rake._sum.amount || 0
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { wallet: true },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isSuspended: true,
        createdAt: true,
        wallet: { select: { balance: true, locked: true } }
      }
    });
    res.json(users);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/user/suspend', async (req, res) => {
  try {
    const { userId, suspended } = req.body;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { isSuspended: suspended }
    });

    await prisma.auditLog.create({
      data: {
        userId: userId,
        action: 'SUSPEND_USER',
        details: `${suspended ? 'Suspended' : 'Unsuspended'} user ${userId}`,
        ipAddress: req.ip
      }
    });

    logger.info(`User ${userId} ${suspended ? 'suspended' : 'unsuspended'}`);
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/wallet/adjust', async (req, res) => {
  try {
    const { userId, amount, reason, adminId } = req.body;
    
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    const updatedWallet = await prisma.wallet.update({
      where: { userId },
      data: { balance: wallet.balance + amount }
    });
    
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: amount,
        balance: updatedWallet.balance,
        type: 'ADJUSTMENT',
        referenceId: `admin_${Date.now()}`,
        description: `Admin adjustment: ${reason}`
      }
    });
    
    await prisma.auditLog.create({
      data: {
        userId: adminId || 'system',
        action: 'WALLET_ADJUST',
        details: `Adjusted ${userId}'s wallet by ${amount}: ${reason}`,
        ipAddress: req.ip
      }
    });
    
    res.json({ success: true, balance: updatedWallet.balance });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const { limit = '100', offset = '0' } = req.query;
    const transactions = await prisma.walletTransaction.findMany({
      orderBy: { createdAt: 'desc' },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      include: { wallet: { include: { user: true } } }
    });
    res.json(transactions);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const { limit = '100', offset = '0' } = req.query;
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: parseInt(offset as string),
      take: parseInt(limit as string),
      include: { user: true }
    });
    res.json(logs);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
