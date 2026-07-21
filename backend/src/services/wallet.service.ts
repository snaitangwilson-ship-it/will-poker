import { prisma } from '../database/client';
import { logger } from '../utils/logger';
import { depositSchema, withdrawSchema } from '../utils/validation';

export class WalletService {
  static async getWallet(userId: string) {
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
      throw new Error('Wallet not found');
    }
    
    return wallet;
  }

  static async getBalance(userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    return {
      balance: wallet.balance,
      locked: wallet.locked,
      available: wallet.balance - wallet.locked
    };
  }

  static async deposit(data: { userId: string; amount: number; method?: string; ip?: string }) {
    const validated = depositSchema.parse(data);
    
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: validated.userId }
      });
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const updatedWallet = await tx.wallet.update({
        where: { userId: validated.userId },
        data: { balance: wallet.balance + validated.amount }
      });
      
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: validated.amount,
          balance: updatedWallet.balance,
          type: 'DEPOSIT',
          referenceId: `deposit_${Date.now()}`,
          description: `Deposit via ${validated.method || 'bank'}`
        }
      });
      
      await tx.auditLog.create({
        data: {
          userId: validated.userId,
          action: 'DEPOSIT',
          details: `Deposited ₹${validated.amount}`,
          ipAddress: data.ip
        }
      });
      
      logger.info(`Deposit: ${validated.userId} +${validated.amount}`, { userId: validated.userId });
      
      return {
        wallet: updatedWallet,
        transaction
      };
    });
  }

  static async withdraw(data: { userId: string; amount: number; ip?: string }) {
    const validated = withdrawSchema.parse(data);
    
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: validated.userId }
      });
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      if (wallet.balance - wallet.locked < validated.amount) {
        throw new Error('Insufficient balance');
      }
      
      const updatedWallet = await tx.wallet.update({
        where: { userId: validated.userId },
        data: { balance: wallet.balance - validated.amount }
      });
      
      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: -validated.amount,
          balance: updatedWallet.balance,
          type: 'WITHDRAWAL',
          referenceId: `withdraw_${Date.now()}`,
          description: 'Withdrawal request'
        }
      });
      
      await tx.auditLog.create({
        data: {
          userId: validated.userId,
          action: 'WITHDRAWAL',
          details: `Withdrew ₹${validated.amount}`,
          ipAddress: data.ip
        }
      });
      
      logger.info(`Withdrawal: ${validated.userId} -${validated.amount}`, { userId: validated.userId });
      
      return {
        wallet: updatedWallet,
        transaction
      };
    });
  }

  static async adjustBalance(data: { userId: string; amount: number; reason: string; adminId: string; ip?: string }) {
    return await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: data.userId }
      });
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      const updatedWallet = await tx.wallet.update({
        where: { userId: data.userId },
        data: { balance: wallet.balance + data.amount }
      });
      
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: data.amount,
          balance: updatedWallet.balance,
          type: 'ADJUSTMENT',
          referenceId: `admin_${Date.now()}`,
          description: `Admin adjustment: ${data.reason}`
        }
      });
      
      await tx.auditLog.create({
        data: {
          userId: data.adminId,
          action: 'WALLET_ADJUST',
          details: `Adjusted ${data.userId}'s wallet by ${data.amount}: ${data.reason}`,
          ipAddress: data.ip
        }
      });
      
      logger.info(`Wallet adjustment: ${data.userId} ${data.amount} by ${data.adminId}`, { 
        userId: data.userId,
        adminId: data.adminId
      });
      
      return updatedWallet;
    });
  }

  static async getTransactionHistory(userId: string, limit: number = 50, offset: number = 0) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit
    });
    
    const total = await prisma.walletTransaction.count({
      where: { walletId: wallet.id }
    });
    
    return {
      transactions,
      total,
      limit,
      offset
    };
  }

  static async lockFunds(userId: string, amount: number, referenceId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    if (wallet.balance - wallet.locked < amount) {
      throw new Error('Insufficient balance');
    }
    
    return await prisma.wallet.update({
      where: { userId },
      data: { locked: wallet.locked + amount }
    });
  }

  static async unlockFunds(userId: string, amount: number, referenceId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    return await prisma.wallet.update({
      where: { userId },
      data: { locked: wallet.locked - amount }
    });
  }

  static async transferFromLocked(userId: string, amount: number, referenceId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    if (wallet.locked < amount) {
      throw new Error('Insufficient locked funds');
    }
    
    return await prisma.wallet.update({
      where: { userId },
      data: {
        locked: wallet.locked - amount,
        balance: wallet.balance + amount
      }
    });
  }
}
