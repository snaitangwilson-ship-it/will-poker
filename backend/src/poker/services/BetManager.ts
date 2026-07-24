export class BetManager {
  validateBet(player: any, amount: number, currentBet: number, minRaise: number): boolean {
    if (amount < 0) return false;
    if (amount > player.stack) return false;
    if (amount < currentBet && amount !== player.stack) return false;
    if (amount > currentBet && amount - currentBet < minRaise && amount !== player.stack) return false;
    return true;
  }
  getMinRaise(currentBet: number, bb: number): number {
    return currentBet + bb * 2;
  }
  getCallAmount(player: any, currentBet: number): number {
    return Math.min(currentBet - player.bet, player.stack);
  }
}
