import { randomInt } from 'crypto';

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${Rank}${Suit}`;

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cards = [];
    const suits: Suit[] = ['♠', '♥', '♦', '♣'];
    const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    for (const suit of suits) {
      for (const rank of ranks) {
        this.cards.push(`${rank}${suit}` as Card);
      }
    }
  }

  // ✅ FIX: shuffle returns a Card[] (not void)
  shuffle(): Card[] {
    const deck = [...this.cards];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  static getRankValue(rank: Rank): number {
    const map: Record<Rank, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return map[rank];
  }

  static parseCard(card: Card): { rank: Rank; suit: Suit } {
    const rank = card.slice(0, -1) as Rank;
    const suit = card.slice(-1) as Suit;
    return { rank, suit };
  }
}