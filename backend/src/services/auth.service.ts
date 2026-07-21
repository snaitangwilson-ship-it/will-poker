import { prisma } from '../database/client';
import { SecurityUtils } from '../utils/security';
import { logger } from '../utils/logger';
import { registerSchema, loginSchema } from '../utils/validation';

export class AuthService {
  static async register(data: { email: string; name: string; password: string }) {
    const validated = registerSchema.parse(data);
    
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email }
    });
    
    if (existingUser) {
      throw new Error('User already exists');
    }
    
    const hashedPassword = SecurityUtils.hashPassword(validated.password);
    
    const user = await prisma.user.create({
      data: {
        email: validated.email,
        name: validated.name,
        password: hashedPassword,
        wallet: { create: { balance: 10000 } }
      },
      include: { wallet: true }
    });
    
    const token = SecurityUtils.generateToken(user.id);
    const refreshToken = SecurityUtils.generateRefreshToken(user.id);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    logger.info(`User registered: ${user.email}`, { userId: user.id });
    
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

  static async login(data: { email: string; password: string; ip?: string; userAgent?: string }) {
    const validated = loginSchema.parse(data);
    
    const user = await prisma.user.findUnique({
      where: { email: validated.email },
      include: { wallet: true }
    });
    
    if (!user) {
      throw new Error('Invalid email or password');
    }
    
    if (user.isSuspended) {
      throw new Error('Account suspended');
    }
    
    const isValid = await SecurityUtils.comparePassword(validated.password, user.password);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }
    
    const token = SecurityUtils.generateToken(user.id);
    const refreshToken = SecurityUtils.generateRefreshToken(user.id);
    
    await prisma.session.create({
      data: {
        userId: user.id,
        token: refreshToken,
        ipAddress: data.ip,
        userAgent: data.userAgent,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        details: `Login from IP ${data.ip}`,
        ipAddress: data.ip
      }
    });
    
    logger.info(`User logged in: ${user.email}`, { userId: user.id, ip: data.ip });
    
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

  static async logout(userId: string, token: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId, token }
    });
    
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'LOGOUT',
        details: 'User logged out'
      }
    });
    
    logger.info(`User logged out`, { userId });
  }

  static async refreshToken(refreshToken: string): Promise<{ token: string }> {
    const session = await prisma.session.findUnique({
      where: { token: refreshToken }
    });
    
    if (!session || session.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }
    
    const token = SecurityUtils.generateToken(session.userId);
    return { token };
  }

  static async validateToken(token: string): Promise<{ userId: string } | null> {
    return SecurityUtils.verifyToken(token);
  }
}
