"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMiddleware = exports.authMiddleware = void 0;
const security_1 = require("../utils/security");
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    const payload = security_1.SecurityUtils.verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    req.userId = payload.userId;
    next();
};
exports.authMiddleware = authMiddleware;
const adminMiddleware = async (req, res, next) => {
    // This will be implemented with role-based access
    next();
};
exports.adminMiddleware = adminMiddleware;
