"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityUtils = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
class SecurityUtils {
    static hashPassword(password) {
        return bcryptjs_1.default.hashSync(password, 10);
    }
    static async comparePassword(password, hash) {
        return bcryptjs_1.default.compare(password, hash);
    }
    static generateToken(userId) {
        return jsonwebtoken_1.default.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
    }
    static generateRefreshToken(userId) {
        return jsonwebtoken_1.default.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });
    }
    static verifyToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, JWT_SECRET);
        }
        catch {
            return null;
        }
    }
    static verifyRefreshToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, JWT_REFRESH_SECRET);
        }
        catch {
            return null;
        }
    }
    static generateRandomToken(length = 32) {
        return crypto_1.default.randomBytes(length).toString('hex');
    }
    static generateOTP() {
        return crypto_1.default.randomInt(100000, 999999).toString();
    }
}
exports.SecurityUtils = SecurityUtils;
