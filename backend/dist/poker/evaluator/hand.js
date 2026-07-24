"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandEvaluator = void 0;
class HandEvaluator {
    static evaluate(hand, community) {
        const allCards = [...hand, ...community];
        const rankCounts = this.getRankCounts(allCards);
        const isFlush = this.isFlush(allCards);
        const isStraight = this.isStraight(allCards);
        // Royal Flush
        if (isFlush && isStraight) {
            const straightCards = this.getStraightCards(allCards);
            if (straightCards.some(c => c.startsWith('A'))) {
                return { rank: 'ROYAL_FLUSH', rankValue: 10, kickers: [], cards: straightCards };
            }
            return { rank: 'STRAIGHT_FLUSH', rankValue: 9, kickers: [], cards: straightCards };
        }
        // Four of a Kind
        const four = this.findNOfAKind(rankCounts, 4);
        if (four) {
            const kickers = this.getKickers(rankCounts, [four]);
            return { rank: 'FOUR_OF_A_KIND', rankValue: 8, kickers: [this.getRankValue(four), ...kickers], cards: allCards };
        }
        // Full House
        const three = this.findNOfAKind(rankCounts, 3);
        const pair = this.findNOfAKind(rankCounts, 2);
        if (three && pair) {
            return { rank: 'FULL_HOUSE', rankValue: 7, kickers: [this.getRankValue(three), this.getRankValue(pair)], cards: allCards };
        }
        // Flush
        if (isFlush) {
            const flushCards = this.getFlushCards(allCards);
            const kickers = flushCards.map(c => this.getRankValue(c.slice(0, -1)));
            return { rank: 'FLUSH', rankValue: 6, kickers: kickers.slice(0, 5), cards: flushCards };
        }
        // Straight
        if (isStraight) {
            const straightCards = this.getStraightCards(allCards);
            return { rank: 'STRAIGHT', rankValue: 5, kickers: [], cards: straightCards };
        }
        // Three of a Kind
        if (three) {
            const kickers = this.getKickers(rankCounts, [three]);
            return { rank: 'THREE_OF_A_KIND', rankValue: 4, kickers: [this.getRankValue(three), ...kickers], cards: allCards };
        }
        // Two Pair
        const pairs = this.findPairs(rankCounts);
        if (pairs.length >= 2) {
            const sorted = pairs.sort((a, b) => this.getRankValue(b) - this.getRankValue(a));
            const kickers = this.getKickers(rankCounts, sorted);
            return { rank: 'TWO_PAIR', rankValue: 3, kickers: [...sorted.map(r => this.getRankValue(r)), ...kickers], cards: allCards };
        }
        // One Pair
        if (pairs.length === 1) {
            const kickers = this.getKickers(rankCounts, pairs);
            return { rank: 'ONE_PAIR', rankValue: 2, kickers: [this.getRankValue(pairs[0]), ...kickers], cards: allCards };
        }
        // High Card
        const kickers = this.getKickers(rankCounts, []);
        return { rank: 'HIGH_CARD', rankValue: 1, kickers: kickers.slice(0, 5), cards: allCards };
    }
    static getRankCounts(cards) {
        const counts = new Map();
        for (const card of cards) {
            const rank = card.slice(0, -1);
            counts.set(rank, (counts.get(rank) || 0) + 1);
        }
        return counts;
    }
    static getRankValue(rank) {
        const values = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
            '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return values[rank] || 0;
    }
    static isFlush(cards) {
        const suits = cards.map(c => c.slice(-1));
        return suits.every(s => s === suits[0]);
    }
    static isStraight(cards) {
        const values = cards.map(c => this.getRankValue(c.slice(0, -1))).sort((a, b) => a - b);
        const unique = [...new Set(values)];
        if (unique.length < 5)
            return false;
        if (unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
            return true;
        }
        for (let i = 0; i <= unique.length - 5; i++) {
            if (unique[i + 4] - unique[i] === 4)
                return true;
        }
        return false;
    }
    static getStraightCards(cards) {
        const sorted = [...cards].sort((a, b) => this.getRankValue(b.slice(0, -1)) - this.getRankValue(a.slice(0, -1)));
        const values = sorted.map(c => this.getRankValue(c.slice(0, -1)));
        if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) {
            return sorted.filter(c => {
                const v = this.getRankValue(c.slice(0, -1));
                return v === 14 || v === 5 || v === 4 || v === 3 || v === 2;
            }).slice(0, 5);
        }
        const result = [];
        for (let i = 0; i < sorted.length - 1 && result.length < 5; i++) {
            const curr = this.getRankValue(sorted[i].slice(0, -1));
            const next = this.getRankValue(sorted[i + 1].slice(0, -1));
            if (curr - next === 1) {
                result.push(sorted[i]);
                if (result.length === 4)
                    result.push(sorted[i + 1]);
            }
            else {
                result.length = 0;
            }
        }
        return result;
    }
    static getFlushCards(cards) {
        return [...cards].sort((a, b) => this.getRankValue(b.slice(0, -1)) - this.getRankValue(a.slice(0, -1))).slice(0, 5);
    }
    static findNOfAKind(rankCounts, n) {
        for (const [rank, count] of rankCounts) {
            if (count === n)
                return rank;
        }
        return null;
    }
    static findPairs(rankCounts) {
        const pairs = [];
        for (const [rank, count] of rankCounts) {
            if (count === 2)
                pairs.push(rank);
        }
        return pairs;
    }
    static getKickers(rankCounts, excludeRanks) {
        const kickers = [];
        for (const [rank, count] of rankCounts) {
            if (!excludeRanks.includes(rank)) {
                for (let i = 0; i < count; i++) {
                    kickers.push(this.getRankValue(rank));
                }
            }
        }
        return kickers.sort((a, b) => b - a);
    }
    static compareHands(hand1, hand2) {
        if (hand1.rankValue !== hand2.rankValue) {
            return hand1.rankValue - hand2.rankValue;
        }
        for (let i = 0; i < Math.min(hand1.kickers.length, hand2.kickers.length); i++) {
            if (hand1.kickers[i] !== hand2.kickers[i]) {
                return hand1.kickers[i] - hand2.kickers[i];
            }
        }
        return 0;
    }
}
exports.HandEvaluator = HandEvaluator;
