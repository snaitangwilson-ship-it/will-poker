"use strict";
// backend/src/poker/services/GameStateManager.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStateManager = void 0;
class GameStateManager {
    constructor(initialState = 'WAITING') {
        this.current = initialState;
    }
    // Reset to the initial state (WAITING)
    reset() {
        this.current = 'WAITING';
    }
    // Transition to a new state (with validation)
    transitionTo(newState) {
        const validTransitions = {
            'WAITING': ['DEALER_ASSIGN'],
            'DEALER_ASSIGN': ['POST_SB'],
            'POST_SB': ['POST_BB'],
            'POST_BB': ['DEAL_HOLE'],
            'DEAL_HOLE': ['PREFLOP'],
            'PREFLOP': ['FLOP', 'SHOWDOWN', 'FINISHED'],
            'FLOP': ['TURN', 'SHOWDOWN', 'FINISHED'],
            'TURN': ['RIVER', 'SHOWDOWN', 'FINISHED'],
            'RIVER': ['SHOWDOWN', 'FINISHED'],
            'SHOWDOWN': ['FINISHED'],
            'FINISHED': ['WAITING'], // allow restart
        };
        const allowed = validTransitions[this.current] || [];
        if (!allowed.includes(newState)) {
            throw new Error(`Invalid transition from ${this.current} to ${newState}`);
        }
        this.current = newState;
    }
    getState() {
        return this.current;
    }
}
exports.GameStateManager = GameStateManager;
