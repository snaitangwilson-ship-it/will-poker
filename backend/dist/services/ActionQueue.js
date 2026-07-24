"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionQueue = void 0;
class ActionQueue {
    constructor() {
        this.queue = new Map();
    }
    async enqueue(gameId, action) {
        const existing = this.queue.get(gameId);
        if (existing) {
            await existing;
        }
        const promise = action().finally(() => {
            if (this.queue.get(gameId) === promise) {
                this.queue.delete(gameId);
            }
        });
        this.queue.set(gameId, promise);
        return promise;
    }
}
exports.ActionQueue = ActionQueue;
