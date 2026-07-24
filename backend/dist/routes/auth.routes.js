"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../database/client");
const security_1 = require("../utils/security");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.post('/register', async (req, res) => {
    try {
        const { email, name, password } = req.body;
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = security_1.SecurityUtils.hashPassword(password);
        const user = await client_1.prisma.user.create({
            data: {
                email,
                name: name || email.split('@')[0],
                password: hashedPassword,
                wallet: { create: { balance: 10000 } }
            },
            include: { wallet: true }
        });
        const token = security_1.SecurityUtils.generateToken(user.id);
        const refreshToken = security_1.SecurityUtils.generateRefreshToken(user.id);
        await client_1.prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });
        logger_1.logger.info(`User registered: ${user.email}`, { userId: user.id });
        res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                wallet: user.wallet
            },
            token,
            refreshToken
        });
    }
    catch (error) {
        logger_1.logger.error('Registration failed:', error);
        res.status(400).json({ error: error.message });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await client_1.prisma.user.findUnique({
            where: { email },
            include: { wallet: true }
        });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        if (user.isSuspended) {
            return res.status(403).json({ error: 'Account suspended' });
        }
        const isValid = await security_1.SecurityUtils.comparePassword(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = security_1.SecurityUtils.generateToken(user.id);
        const refreshToken = security_1.SecurityUtils.generateRefreshToken(user.id);
        await client_1.prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'LOGIN',
                details: `Login from IP ${req.ip}`,
                ipAddress: req.ip
            }
        });
        logger_1.logger.info(`User logged in: ${user.email}`, { userId: user.id });
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                wallet: user.wallet,
                isSuspended: user.isSuspended,
                role: user.role
            },
            token,
            refreshToken
        });
    }
    catch (error) {
        logger_1.logger.error('Login failed:', error);
        res.status(401).json({ error: error.message });
    }
});
router.post('/logout', async (req, res) => {
    try {
        const { userId, token } = req.body;
        await client_1.prisma.session.deleteMany({
            where: { userId, token }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId,
                action: 'LOGOUT',
                details: 'User logged out'
            }
        });
        logger_1.logger.info(`User logged out`, { userId });
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const session = await client_1.prisma.session.findUnique({
            where: { token: refreshToken }
        });
        if (!session || session.expiresAt < new Date()) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }
        const token = security_1.SecurityUtils.generateToken(session.userId);
        res.json({ token });
    }
    catch (error) {
        res.status(401).json({ error: error.message });
    }
});
exports.default = router;
