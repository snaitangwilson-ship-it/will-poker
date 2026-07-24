"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../database/client");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.get('/stats', async (req, res) => {
    try {
        const [users, tables, games, seats, rake] = await Promise.all([
            client_1.prisma.user.count(),
            client_1.prisma.pokerTable.count(),
            client_1.prisma.game.count(),
            client_1.prisma.seat.count({ where: { isSitting: true } }),
            client_1.prisma.walletTransaction.aggregate({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/users', async (req, res) => {
    try {
        const users = await client_1.prisma.user.findMany({
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
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/user/suspend', async (req, res) => {
    try {
        const { userId, suspended } = req.body;
        const user = await client_1.prisma.user.update({
            where: { id: userId },
            data: { isSuspended: suspended }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: userId,
                action: 'SUSPEND_USER',
                details: `${suspended ? 'Suspended' : 'Unsuspended'} user ${userId}`,
                ipAddress: req.ip
            }
        });
        logger_1.logger.info(`User ${userId} ${suspended ? 'suspended' : 'unsuspended'}`);
        res.json({ success: true, user });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/wallet/adjust', async (req, res) => {
    try {
        const { userId, amount, reason, adminId } = req.body;
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
                type: 'ADJUSTMENT',
                referenceId: `admin_${Date.now()}`,
                description: `Admin adjustment: ${reason}`
            }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: adminId || 'system',
                action: 'WALLET_ADJUST',
                details: `Adjusted ${userId}'s wallet by ${amount}: ${reason}`,
                ipAddress: req.ip
            }
        });
        res.json({ success: true, balance: updatedWallet.balance });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/transactions', async (req, res) => {
    try {
        const { limit = '100', offset = '0' } = req.query;
        const transactions = await client_1.prisma.walletTransaction.findMany({
            orderBy: { createdAt: 'desc' },
            skip: parseInt(offset),
            take: parseInt(limit),
            include: { wallet: { include: { user: true } } }
        });
        res.json(transactions);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.get('/audit-logs', async (req, res) => {
    try {
        const { limit = '100', offset = '0' } = req.query;
        const logs = await client_1.prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            skip: parseInt(offset),
            take: parseInt(limit),
            include: { user: true }
        });
        res.json(logs);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
exports.default = router;
