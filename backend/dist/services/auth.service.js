"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const client_1 = require("../database/client");
const security_1 = require("../utils/security");
const logger_1 = require("../utils/logger");
const validation_1 = require("../utils/validation");
class AuthService {
    static async register(data) {
        const validated = validation_1.registerSchema.parse(data);
        const existingUser = await client_1.prisma.user.findUnique({
            where: { email: validated.email }
        });
        if (existingUser) {
            throw new Error('User already exists');
        }
        const hashedPassword = security_1.SecurityUtils.hashPassword(validated.password);
        const user = await client_1.prisma.user.create({
            data: {
                email: validated.email,
                name: validated.name,
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
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                wallet: user.wallet
            },
            token,
            refreshToken
        };
    }
    static async login(data) {
        const validated = validation_1.loginSchema.parse(data);
        const user = await client_1.prisma.user.findUnique({
            where: { email: validated.email },
            include: { wallet: true }
        });
        if (!user) {
            throw new Error('Invalid email or password');
        }
        if (user.isSuspended) {
            throw new Error('Account suspended');
        }
        const isValid = await security_1.SecurityUtils.comparePassword(validated.password, user.password);
        if (!isValid) {
            throw new Error('Invalid email or password');
        }
        const token = security_1.SecurityUtils.generateToken(user.id);
        const refreshToken = security_1.SecurityUtils.generateRefreshToken(user.id);
        await client_1.prisma.session.create({
            data: {
                userId: user.id,
                token: refreshToken,
                ipAddress: data.ip,
                userAgent: data.userAgent,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            }
        });
        await client_1.prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'LOGIN',
                details: `Login from IP ${data.ip}`,
                ipAddress: data.ip
            }
        });
        logger_1.logger.info(`User logged in: ${user.email}`, { userId: user.id, ip: data.ip });
        return {
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
        };
    }
    static async logout(userId, token) {
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
    }
    static async refreshToken(refreshToken) {
        const session = await client_1.prisma.session.findUnique({
            where: { token: refreshToken }
        });
        if (!session || session.expiresAt < new Date()) {
            throw new Error('Invalid refresh token');
        }
        const token = security_1.SecurityUtils.generateToken(session.userId);
        return { token };
    }
    static async validateToken(token) {
        return security_1.SecurityUtils.verifyToken(token);
    }
}
exports.AuthService = AuthService;
