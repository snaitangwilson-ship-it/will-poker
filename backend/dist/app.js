"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const logger_1 = require("./middleware/logger");
const rate_limit_1 = require("./middleware/rate-limit");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const wallet_routes_1 = __importDefault(require("./routes/wallet.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express_1.default.json());
app.use(logger_1.requestLogger);
app.use(rate_limit_1.rateLimiter);
app.use('/api/auth', auth_routes_1.default);
app.use('/api/wallet', wallet_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api', health_routes_1.default);
exports.default = app;
