"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const logger_1 = require("../utils/logger");
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger_1.logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`, {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
    });
    next();
};
exports.requestLogger = requestLogger;
