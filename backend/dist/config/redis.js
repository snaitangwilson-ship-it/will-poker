"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
exports.redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
        if (times > 3) {
            console.log('⚠️ Redis connection failed after 3 retries. Continuing without Redis...');
            return null;
        }
        return Math.min(times * 50, 2000);
    }
});
exports.redis.on('error', (err) => {
    console.log('⚠️ Redis error (session storage will use memory fallback):', err.message);
});
exports.redis.on('connect', () => {
    console.log('✅ Redis connected');
});
