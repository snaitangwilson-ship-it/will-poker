"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandEvaluator = void 0;
const Deck_1 = require("./Deck");
class HandEvaluator {
    static evaluate(holeCards, communityCards) {
        const allCards = [...holeCards, ...communityCards];
        if (allCards.length < 5) {
            const sorted = this.sortCardsByValue(allCards);
            return {
                rank: 'HIGH_CARD',
                rankValue: 1,
                kickers: sorted.map(c => this.getCardValue(c)),
                cards: sorted.slice(0, 5),
            };
        }
        const combinations = this.getCombinations(allCards, 5);
        let best = null;
        for (const combo of combinations) {
            const result = this.evaluateFive(combo);
            if (!best || this.compareHands(result, best) > 0) {
                best = result;
            }
        }
        if (!best)
            throw new Error('No hand evaluated');
        return best;
    }
    static evaluateFive(cards) {
        const values = cards.map(c => this.getCardValue(c)).sort((a, b) => b - a);
        const suits = cards.map(c => this.getCardSuit(c));
        const isFlush = suits.every(s => s === suits[0]);
        let isStraight = false;
        let highCard = values[0];
        if (values[0] - values[4] === 4) {
            isStraight = true;
            highCard = values[0];
        }
        if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
            isStraight = true;
            highCard = 5;
        }
        if (isFlush && isStraight) {
            if (highCard === 14) {
                return { rank: 'ROYAL_FLUSH', rankValue: 10, kickers: [], cards };
            }
            return { rank: 'STRAIGHT_FLUSH', rankValue: 9, kickers: [highCard], cards };
        }
        const rankCounts = this.getRankCounts(cards);
        const counts = Object.values(rankCounts);
        const valuesByCount = {};
        for (const [rankStr, count] of Object.entries(rankCounts)) {
            const v = this.getRankValue(rankStr);
            if (!valuesByCount[count])
                valuesByCount[count] = [];
            valuesByCount[count].push(v);
        }
        for (const key in valuesByCount) {
            valuesByCount[key].sort((a, b) => b - a);
        }
        if (counts.includes(4)) {
            const fourVal = valuesByCount[4][0];
            const kicker = values.find(v => v !== fourVal);
            return { rank: 'FOUR_OF_A_KIND', rankValue: 8, kickers: [fourVal, kicker], cards };
        }
        if (counts.includes(3) && counts.includes(2)) {
            const threeVal = valuesByCount[3][0];
            const pairVal = valuesByCount[2][0];
            return { rank: 'FULL_HOUSE', rankValue: 7, kickers: [threeVal, pairVal], cards };
        }
        if (isFlush) {
            return { rank: 'FLUSH', rankValue: 6, kickers: values, cards };
        }
        if (isStraight) {
            return { rank: 'STRAIGHT', rankValue: 5, kickers: [highCard], cards };
        }
        if (counts.includes(3)) {
            const threeVal = valuesByCount[3][0];
            const kickers = values.filter(v => v !== threeVal).sort((a, b) => b - a);
            return { rank: 'THREE_OF_A_KIND', rankValue: 4, kickers: [threeVal, ...kickers], cards };
        }
        if (counts.filter(c => c === 2).length === 2) {
            const pairs = valuesByCount[2].sort((a, b) => b - a);
            const kicker = values.find(v => !pairs.includes(v));
            return { rank: 'TWO_PAIR', rankValue: 3, kickers: [...pairs, kicker], cards };
        }
        if (counts.includes(2)) {
            const pairVal = valuesByCount[2][0];
            const kickers = values.filter(v => v !== pairVal).sort((a, b) => b - a);
            return { rank: 'ONE_PAIR', rankValue: 2, kickers: [pairVal, ...kickers], cards };
        }
        return { rank: 'HIGH_CARD', rankValue: 1, kickers: values, cards };
    }
    static getCombinations(cards, r) {
        if (r === 0)
            return [[]];
        if (cards.length === 0)
            return [];
        const [first, ...rest] = cards;
        const withFirst = this.getCombinations(rest, r - 1).map(c => [first, ...c]);
        const withoutFirst = this.getCombinations(rest, r);
        return [...withFirst, ...withoutFirst];
    }
    static compareHands(a, b) {
        if (a.rankValue !== b.rankValue)
            return a.rankValue - b.rankValue;
        for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
            if (a.kickers[i] !== b.kickers[i])
                return a.kickers[i] - b.kickers[i];
        }
        return 0;
    }
    static getCardValue(card) {
        const rank = card.slice(0, -1);
        return Deck_1.Deck.getRankValue(rank);
    }
    static getCardSuit(card) {
        return card.slice(-1);
    }
    static getRankValue(rank) {
        return Deck_1.Deck.getRankValue(rank);
    }
    static sortCardsByValue(cards) {
        return [...cards].sort((a, b) => this.getCardValue(b) - this.getCardValue(a));
    }
    static getRankCounts(cards) {
        const counts = {};
        for (const card of cards) {
            const rank = card.slice(0, -1);
            counts[rank] = (counts[rank] || 0) + 1;
        }
        return counts;
    }
}
exports.HandEvaluator = HandEvaluator;
