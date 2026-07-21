import crypto from 'crypto';

export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];
export type Card = `${Rank}${Suit}`;

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(`${rank}${suit}` as Card);
      }
    }
  }

  shuffle(): Card[] {
    const deck = [...this.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  getRemaining(): number {
    return this.cards.length;
  }

  static getRankValue(rank: Rank): number {
    const values: Record<Rank, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank];
  }

  static parseCard(card: Card): { rank: Rank; suit: Suit } {
    const rank = card.slice(0, -1) as Rank;
    const suit = card.slice(-1) as Suit;
    return { rank, suit };
  }

  static sortCards(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
      const aRank = this.getRankValue(a.slice(0, -1) as Rank);
      const bRank = this.getRankValue(b.slice(0, -1) as Rank);
      return bRank - aRank;
    });
  }
}
