"use strict";
// backend/src/poker/services/PotManager.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.PotManager = void 0;
const HandEvaluator_1 = require("../HandEvaluator");
class PotManager {
    /**
     * Calculate main pot and side pots based on player bets.
     * Returns an array of pots, each with amount and eligible players.
     */
    static calculatePots(players) {
        // Filter out folded players (they don't contribute to pots)
        const activePlayers = players.filter(p => !p.hasFolded);
        if (activePlayers.length === 0)
            return [];
        // Sort by bet amount ascending
        const sorted = [...activePlayers].sort((a, b) => a.bet - b.bet);
        const pots = [];
        let remainingBets = sorted.map(p => p.bet);
        while (remainingBets.some(b => b > 0)) {
            // Find the smallest bet > 0
            const minBet = Math.min(...remainingBets.filter(b => b > 0));
            // All players with bet >= minBet contribute minBet to this pot
            const contributors = sorted.filter((_, i) => remainingBets[i] >= minBet);
            const amount = minBet * contributors.length;
            const eligiblePlayers = contributors.map(p => p.userId);
            pots.push({ amount, eligiblePlayers });
            // Subtract minBet from all remaining bets
            remainingBets = remainingBets.map(b => Math.max(0, b - minBet));
        }
        // Remove empty pots (shouldn't happen, but safe)
        return pots.filter(p => p.amount > 0);
    }
    /**
     * Distribute the pot(s) to the winner(s).
     * Returns a map of userId -> amount won.
     */
    static distributePots(pots, communityCards, playerHoleCards) {
        const winnings = new Map();
        for (const pot of pots) {
            if (pot.eligiblePlayers.length === 0)
                continue;
            // Evaluate each player's hand
            const results = pot.eligiblePlayers.map(userId => {
                const hole = playerHoleCards.get(userId) || [];
                const result = HandEvaluator_1.HandEvaluator.evaluate(hole, communityCards);
                return { userId, result };
            });
            // Find the best hand
            let best = results[0];
            for (const r of results) {
                if (HandEvaluator_1.HandEvaluator.compareHands(r.result, best.result) > 0) {
                    best = r;
                }
            }
            // Award the pot to the best hand (split if tie – simplified)
            const winners = results.filter(r => HandEvaluator_1.HandEvaluator.compareHands(r.result, best.result) === 0);
            const share = Math.floor(pot.amount / winners.length);
            for (const w of winners) {
                const current = winnings.get(w.userId) || 0;
                winnings.set(w.userId, current + share);
            }
        }
        return winnings;
    }
    /**
     * Simple helper to get the current bet for a player.
     */
    static getPlayerBet(player) {
        return player.bet;
    }
    /**
     * Helper to check if a player is all-in.
     */
    static isAllIn(player) {
        return player.isAllIn;
    }
}
exports.PotManager = PotManager;
