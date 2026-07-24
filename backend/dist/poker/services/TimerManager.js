"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerManager = void 0;
class TimerManager {
    constructor() {
        this.timer = null;
        this.remaining = 0;
    }
    start(seconds, onTimeout, tickCallback) {
        this.stop();
        this.remaining = seconds;
        this.onTick = tickCallback;
        this.timer = setInterval(() => {
            this.remaining--;
            if (this.onTick)
                this.onTick(this.remaining);
            if (this.remaining <= 0) {
                this.stop();
                onTimeout();
            }
        }, 1000);
    }
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    reset() { this.stop(); }
    getRemaining() { return this.remaining; }
}
exports.TimerManager = TimerManager;
