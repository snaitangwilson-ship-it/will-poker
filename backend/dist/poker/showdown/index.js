"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShowdownEngine = void 0;
const hand_1 = require("../evaluator/hand");
class ShowdownEngine {
    determineWinners(players, communityCards, sidePots) {
        const winners = [];
        for (const sidePot of sidePots) {
            const eligiblePlayers = players.filter(p => sidePot.eligiblePlayers.includes(p.userId));
            if (eligiblePlayers.length === 0)
                continue;
            const hands = eligiblePlayers.map(p => ({
                player: p,
                hand: hand_1.HandEvaluator.evaluate(p.holeCards, communityCards)
            }));
            hands.sort((a, b) => {
                const comparison = hand_1.HandEvaluator.compareHands(a.hand, b.hand);
                return comparison;
            });
            const bestHand = hands[0];
            const potWinners = hands.filter(h => hand_1.HandEvaluator.compareHands(h.hand, bestHand.hand) === 0);
            const share = Math.floor(sidePot.amount / potWinners.length);
            for (const winner of potWinners) {
                winners.push({ player: winner.player, amount: share });
            }
        }
        return winners;
    }
}
exports.ShowdownEngine = ShowdownEngine;
