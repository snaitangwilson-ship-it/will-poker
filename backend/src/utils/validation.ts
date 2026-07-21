import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(50),
  password: z.string().min(6).max(100)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

export const depositSchema = z.object({
  userId: z.string(),
  amount: z.number().positive(),
  method: z.string().optional()
});

export const withdrawSchema = z.object({
  userId: z.string(),
  amount: z.number().positive()
});

export const joinTableSchema = z.object({
  userId: z.string(),
  stakes: z.number().positive()
});

export const gameActionSchema = z.object({
  gameId: z.string(),
  playerId: z.string(),
  action: z.enum(['fold', 'check', 'call', 'raise', 'all_in', 'sit_out', 'sit_back']),
  amount: z.number().optional()
});

export const chatMessageSchema = z.object({
  tableId: z.string(),
  userId: z.string(),
  message: z.string().max(500)
});

export const adminAdjustSchema = z.object({
  userId: z.string(),
  amount: z.number(),
  reason: z.string().min(3)
});
