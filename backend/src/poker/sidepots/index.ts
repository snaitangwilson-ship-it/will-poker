import { Player } from '../engine/game';

export class SidePotEngine {
  calculate(players: Player[], pot: number): { amount: number; eligiblePlayers: string[] }[] {
    const activePlayers = players.filter(p => p.isActive && !p.hasFolded);
    const allInPlayers = activePlayers.filter(p => p.isAllIn);
    
    if (allInPlayers.length === 0) {
      return [{ amount: pot, eligiblePlayers: activePlayers.map(p => p.userId) }];
    }

    const sidePots: { amount: number; eligiblePlayers: string[] }[] = [];
    let remainingPot = pot;
    let remainingPlayers = activePlayers.map(p => p.userId);

    allInPlayers.sort((a, b) => a.bet - b.bet);

    for (const allIn of allInPlayers) {
      const contribution = allIn.bet;
      const eligible = activePlayers
        .filter(p => p.bet >= contribution)
        .map(p => p.userId);
      
      if (eligible.length > 0) {
        const amount = contribution * eligible.length;
        sidePots.push({ amount, eligiblePlayers: eligible });
        remainingPot -= amount;
        remainingPlayers = eligible;
      }
    }

    if (remainingPot > 0) {
      sidePots.push({ amount: remainingPot, eligiblePlayers: remainingPlayers });
    }

    return sidePots;
  }
}
