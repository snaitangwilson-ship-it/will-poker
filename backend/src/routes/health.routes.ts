import { Router } from 'express';
import { prisma } from '../database/client';
import { redis } from '../config/redis';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      redis: redis.status === 'ready' ? 'connected' : 'fallback',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: String(error)
    });
  }
});

export default router;
