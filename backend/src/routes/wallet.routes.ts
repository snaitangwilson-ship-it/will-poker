import { Router } from 'express';
import { prisma } from '../database/client';
import { logger } from '../utils/logger';

const router = Router();

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 100
        }
      }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json(wallet);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json({
      balance: wallet.balance,
      locked: wallet.locked,
      available: wallet.balance - wallet.locked
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, method } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
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
        type: 'DEPOSIT',
        referenceId: `deposit_${Date.now()}`,
        description: `Deposit via ${method || 'bank'}`
      }
    });
    
    await prisma.auditLog.create({
      data: {
        userId: userId,
        action: 'DEPOSIT',
        details: `Deposited ₹${amount}`,
        ipAddress: req.ip
      }
    });
    
    logger.info(`Deposit: ${userId} +${amount}`);
    res.json({ success: true, balance: updatedWallet.balance });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    if (wallet.balance - wallet.locked < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    const updatedWallet = await prisma.wallet.update({
      where: { userId },
      data: { balance: wallet.balance - amount }
    });
    
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -amount,
        balance: updatedWallet.balance,
        type: 'WITHDRAWAL',
        referenceId: `withdraw_${Date.now()}`,
        description: 'Withdrawal request'
      }
    });
    
    await prisma.auditLog.create({
      data: {
        userId: userId,
        action: 'WITHDRAWAL',
        details: `Withdrew ₹${amount}`,
        ipAddress: req.ip
      }
    });
    
    logger.info(`Withdrawal: ${userId} -${amount}`);
    res.json({ success: true, balance: updatedWallet.balance });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:userId/transactions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(offset as string),
      take: parseInt(limit as string)
    });
    
    const total = await prisma.walletTransaction.count({
      where: { walletId: wallet.id }
    });
    
    res.json({
      transactions,
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
