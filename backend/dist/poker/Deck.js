"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Deck = void 0;
const crypto_1 = require("crypto");
class Deck {
    constructor() {
        this.cards = [];
        this.reset();
    }
    reset() {
        this.cards = [];
        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        for (const suit of suits) {
            for (const rank of ranks) {
                this.cards.push(`${rank}${suit}`);
            }
        }
    }
    // ✅ FIX: shuffle returns a Card[] (not void)
    shuffle() {
        const deck = [...this.cards];
        for (let i = deck.length - 1; i > 0; i--) {
            const j = (0, crypto_1.randomInt)(i + 1);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    static getRankValue(rank) {
        const map = {
            '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
            '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
        };
        return map[rank];
    }
    static parseCard(card) {
        const rank = card.slice(0, -1);
        const suit = card.slice(-1);
        return { rank, suit };
    }
}
exports.Deck = Deck;
