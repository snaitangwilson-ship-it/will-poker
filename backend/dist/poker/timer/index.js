"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PokerTimer = void 0;
class PokerTimer {
    constructor(maxTime) {
        this.timeoutId = null;
        this.maxTime = maxTime;
        this.remaining = maxTime;
    }
    start(callback) {
        this.stop();
        this.remaining = this.maxTime;
        this.timeoutId = setTimeout(callback, this.maxTime);
    }
    reset() {
        this.remaining = this.maxTime;
    }
    stop() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }
    getRemaining() {
        return this.remaining;
    }
    isRunning() {
        return this.timeoutId !== null;
    }
}
exports.PokerTimer = PokerTimer;
