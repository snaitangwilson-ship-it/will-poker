// backend/src/poker/services/PotManager.ts

import { Card } from '../Deck';
import { HandEvaluator } from '../HandEvaluator';

export interface PlayerPotInfo {
  userId: string;
  stack: number;
  bet: number;
  isAllIn: boolean;
  hasFolded: boolean;
}

export interface Pot {
  amount: number;
  eligiblePlayers: string[]; // userIds who can win this pot
}

export class PotManager {
  /**
   * Calculate main pot and side pots based on player bets.
   * Returns an array of pots, each with amount and eligible players.
   */
  static calculatePots(players: PlayerPotInfo[]): Pot[] {
    // Filter out folded players (they don't contribute to pots)
    const activePlayers = players.filter(p => !p.hasFolded);
    if (activePlayers.length === 0) return [];

    // Sort by bet amount ascending
    const sorted = [...activePlayers].sort((a, b) => a.bet - b.bet);
    const pots: Pot[] = [];
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
  static distributePots(
    pots: Pot[],
    communityCards: Card[],
    playerHoleCards: Map<string, Card[]>
  ): Map<string, number> {
    const winnings = new Map<string, number>();

    for (const pot of pots) {
      if (pot.eligiblePlayers.length === 0) continue;

      // Evaluate each player's hand
      const results = pot.eligiblePlayers.map(userId => {
        const hole = playerHoleCards.get(userId) || [];
        const result = HandEvaluator.evaluate(hole, communityCards);
        return { userId, result };
      });

      // Find the best hand
      let best = results[0];
      for (const r of results) {
        if (HandEvaluator.compareHands(r.result, best.result) > 0) {
          best = r;
        }
      }

      // Award the pot to the best hand (split if tie – simplified)
      const winners = results.filter(r =>
        HandEvaluator.compareHands(r.result, best.result) === 0
      );

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
  static getPlayerBet(player: PlayerPotInfo): number {
    return player.bet;
  }

  /**
   * Helper to check if a player is all-in.
   */
  static isAllIn(player: PlayerPotInfo): boolean {
    return player.isAllIn;
  }
}