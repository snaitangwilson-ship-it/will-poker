"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../database/client");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const wallet = await client_1.prisma.wallet.findUnique({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/:userId/balance', async (req, res) => {
    try {
        const { userId } = req.params;
        const wallet = await client_1.prisma.wallet.findUnique({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/deposit', async (req, res) => {
    try {
        const { userId, amount, method } = req.body;
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        const wallet = await client_1.prisma.wallet.findUnique({
            where: { userId }
        });
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        const updatedWallet = await client_1.prisma.wallet.update({
            where: { userId },
            data: { balance: wallet.balance + amount }
        });
        await client_1.prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: amount,
                balance: updatedWallet.balance,
                type: 'DEPOSIT',
                referenceId: `deposit_${Date.now()}`,
                description: `Deposit via ${method || 'bank'}`
            }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: userId,
                action: 'DEPOSIT',
                details: `Deposited ₹${amount}`,
                ipAddress: req.ip
            }
        });
        logger_1.logger.info(`Deposit: ${userId} +${amount}`);
        res.json({ success: true, balance: updatedWallet.balance });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/withdraw', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        if (!userId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        const wallet = await client_1.prisma.wallet.findUnique({
            where: { userId }
        });
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        if (wallet.balance - wallet.locked < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        const updatedWallet = await client_1.prisma.wallet.update({
            where: { userId },
            data: { balance: wallet.balance - amount }
        });
        await client_1.prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                amount: -amount,
                balance: updatedWallet.balance,
                type: 'WITHDRAWAL',
                referenceId: `withdraw_${Date.now()}`,
                description: 'Withdrawal request'
            }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: userId,
                action: 'WITHDRAWAL',
                details: `Withdrew ₹${amount}`,
                ipAddress: req.ip
            }
        });
        logger_1.logger.info(`Withdrawal: ${userId} -${amount}`);
        res.json({ success: true, balance: updatedWallet.balance });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/:userId/transactions', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = '50', offset = '0' } = req.query;
        const wallet = await client_1.prisma.wallet.findUnique({
            where: { userId }
        });
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        const transactions = await client_1.prisma.walletTransaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            skip: parseInt(offset),
            take: parseInt(limit)
        });
        const total = await client_1.prisma.walletTransaction.count({
            where: { walletId: wallet.id }
        });
        res.json({
            transactions,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
