import { Card, Deck, RANKS } from './Deck';

export type HandRank = 
  | 'HIGH_CARD'
  | 'ONE_PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'ROYAL_FLUSH';

export interface HandResult {
  rank: HandRank;
  rankValue: number;
  kickers: number[];
  cards: Card[];
}

export class HandEvaluator {
  static evaluate(hand: Card[], community: Card[]): HandResult {
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
      return { 
        rank: 'FOUR_OF_A_KIND', 
        rankValue: 8, 
        kickers: [Deck.getRankValue(four as any), ...kickers], 
        cards: allCards 
      };
    }

    // Full House
    const three = this.findNOfAKind(rankCounts, 3);
    const pair = this.findNOfAKind(rankCounts, 2);
    if (three && pair) {
      return { 
        rank: 'FULL_HOUSE', 
        rankValue: 7, 
        kickers: [Deck.getRankValue(three as any), Deck.getRankValue(pair as any)], 
        cards: allCards 
      };
    }

    // Flush
    if (isFlush) {
      const flushCards = this.getFlushCards(allCards);
      const kickers = flushCards.map(c => Deck.getRankValue(c.slice(0, -1) as any));
      return { 
        rank: 'FLUSH', 
        rankValue: 6, 
        kickers: kickers.slice(0, 5), 
        cards: flushCards 
      };
    }

    // Straight
    if (isStraight) {
      const straightCards = this.getStraightCards(allCards);
      return { 
        rank: 'STRAIGHT', 
        rankValue: 5, 
        kickers: [], 
        cards: straightCards 
      };
    }

    // Three of a Kind
    if (three) {
      const kickers = this.getKickers(rankCounts, [three]);
      return { 
        rank: 'THREE_OF_A_KIND', 
        rankValue: 4, 
        kickers: [Deck.getRankValue(three as any), ...kickers], 
        cards: allCards 
      };
    }

    // Two Pair
    const pairs = this.findPairs(rankCounts);
    if (pairs.length >= 2) {
      const sorted = pairs.sort((a, b) => Deck.getRankValue(b as any) - Deck.getRankValue(a as any));
      const kickers = this.getKickers(rankCounts, sorted);
      return { 
        rank: 'TWO_PAIR', 
        rankValue: 3, 
        kickers: [...sorted.map(r => Deck.getRankValue(r as any)), ...kickers], 
        cards: allCards 
      };
    }

    // One Pair
    if (pairs.length === 1) {
      const kickers = this.getKickers(rankCounts, pairs);
      return { 
        rank: 'ONE_PAIR', 
        rankValue: 2, 
        kickers: [Deck.getRankValue(pairs[0] as any), ...kickers], 
        cards: allCards 
      };
    }

    // High Card
    const kickers = this.getKickers(rankCounts, []);
    return { 
      rank: 'HIGH_CARD', 
      rankValue: 1, 
      kickers: kickers.slice(0, 5), 
      cards: allCards 
    };
  }

  private static getRankCounts(cards: Card[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const card of cards) {
      const rank = card.slice(0, -1);
      counts.set(rank, (counts.get(rank) || 0) + 1);
    }
    return counts;
  }

  private static isFlush(cards: Card[]): boolean {
    const suits = cards.map(c => c.slice(-1));
    return suits.every(s => s === suits[0]);
  }

  private static isStraight(cards: Card[]): boolean {
    const values = cards.map(c => Deck.getRankValue(c.slice(0, -1) as any)).sort((a, b) => a - b);
    const unique = [...new Set(values)];
    if (unique.length < 5) return false;
    if (unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
      return true;
    }
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i + 4] - unique[i] === 4) return true;
    }
    return false;
  }

  private static getStraightCards(cards: Card[]): Card[] {
    const sorted = [...cards].sort((a, b) => 
      Deck.getRankValue(b.slice(0, -1) as any) - Deck.getRankValue(a.slice(0, -1) as any)
    );
    const values = sorted.map(c => Deck.getRankValue(c.slice(0, -1) as any));
    
    // Ace-low straight (A-2-3-4-5)
    if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) {
      return sorted.filter(c => {
        const v = Deck.getRankValue(c.slice(0, -1) as any);
        return v === 14 || v === 5 || v === 4 || v === 3 || v === 2;
      }).slice(0, 5);
    }
    
    const result: Card[] = [];
    for (let i = 0; i < sorted.length - 1 && result.length < 5; i++) {
      const curr = Deck.getRankValue(sorted[i].slice(0, -1) as any);
      const next = Deck.getRankValue(sorted[i + 1].slice(0, -1) as any);
      if (curr - next === 1) {
        result.push(sorted[i]);
        if (result.length === 4) result.push(sorted[i + 1]);
      } else {
        result.length = 0;
      }
    }
    return result;
  }

  private static getFlushCards(cards: Card[]): Card[] {
    return [...cards]
      .sort((a, b) => Deck.getRankValue(b.slice(0, -1) as any) - Deck.getRankValue(a.slice(0, -1) as any))
      .slice(0, 5);
  }

  private static findNOfAKind(rankCounts: Map<string, number>, n: number): string | null {
    for (const [rank, count] of rankCounts) {
      if (count === n) return rank;
    }
    return null;
  }

  private static findPairs(rankCounts: Map<string, number>): string[] {
    const pairs: string[] = [];
    for (const [rank, count] of rankCounts) {
      if (count === 2) pairs.push(rank);
    }
    return pairs;
  }

  private static getKickers(rankCounts: Map<string, number>, excludeRanks: string[]): number[] {
    const kickers: number[] = [];
    for (const [rank, count] of rankCounts) {
      if (!excludeRanks.includes(rank)) {
        for (let i = 0; i < count; i++) {
          kickers.push(Deck.getRankValue(rank as any));
        }
      }
    }
    return kickers.sort((a, b) => b - a);
  }

  static compareHands(a: HandResult, b: HandResult): number {
    if (a.rankValue !== b.rankValue) {
      return a.rankValue - b.rankValue;
    }
    for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
      if (a.kickers[i] !== b.kickers[i]) {
        return a.kickers[i] - b.kickers[i];
      }
    }
    return 0;
  }
}
