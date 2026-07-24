"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAdjustSchema = exports.chatMessageSchema = exports.gameActionSchema = exports.joinTableSchema = exports.withdrawSchema = exports.depositSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(2).max(50),
    password: zod_1.z.string().min(6).max(100)
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string()
});
exports.depositSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    amount: zod_1.z.number().positive(),
    method: zod_1.z.string().optional()
});
exports.withdrawSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    amount: zod_1.z.number().positive()
});
exports.joinTableSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    stakes: zod_1.z.number().positive()
});
exports.gameActionSchema = zod_1.z.object({
    gameId: zod_1.z.string(),
    playerId: zod_1.z.string(),
    action: zod_1.z.enum(['fold', 'check', 'call', 'raise', 'all_in', 'sit_out', 'sit_back']),
    amount: zod_1.z.number().optional()
});
exports.chatMessageSchema = zod_1.z.object({
    tableId: zod_1.z.string(),
    userId: zod_1.z.string(),
    message: zod_1.z.string().max(500)
});
exports.adminAdjustSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    amount: zod_1.z.number(),
    reason: zod_1.z.string().min(3)
});
