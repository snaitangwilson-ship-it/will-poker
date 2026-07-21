import { Player } from '../engine/game';
import { HandEvaluator } from '../evaluator/hand';

export class ShowdownEngine {
  determineWinners(
    players: Player[],
    communityCards: string[],
    sidePots: { amount: number; eligiblePlayers: string[] }[]
  ): { player: Player; amount: number }[] {
    const winners: { player: Player; amount: number }[] = [];

    for (const sidePot of sidePots) {
      const eligiblePlayers = players.filter(p => 
        sidePot.eligiblePlayers.includes(p.userId)
      );

      if (eligiblePlayers.length === 0) continue;

      const hands = eligiblePlayers.map(p => ({
        player: p,
        hand: HandEvaluator.evaluate(p.holeCards, communityCards)
      }));

      hands.sort((a, b) => {
        const comparison = HandEvaluator.compareHands(a.hand, b.hand);
        return comparison;
      });

      const bestHand = hands[0];
      const potWinners = hands.filter(h => 
        HandEvaluator.compareHands(h.hand, bestHand.hand) === 0
      );

      const share = Math.floor(sidePot.amount / potWinners.length);
      for (const winner of potWinners) {
        winners.push({ player: winner.player, amount: share });
      }
    }

    return winners;
  }
}
