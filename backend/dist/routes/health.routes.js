"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("../database/client");
const redis_1 = require("../config/redis");
const router = (0, express_1.Router)();
router.get('/health', async (req, res) => {
    try {
        await client_1.prisma.$queryRaw `SELECT 1`;
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            redis: redis_1.redis.status === 'ready' ? 'connected' : 'fallback',
            uptime: process.uptime()
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: String(error)
        });
    }
});
exports.default = router;
