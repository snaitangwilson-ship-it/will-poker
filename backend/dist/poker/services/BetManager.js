"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetManager = void 0;
class BetManager {
    validateBet(player, amount, currentBet, minRaise) {
        if (amount < 0)
            return false;
        if (amount > player.stack)
            return false;
        if (amount < currentBet && amount !== player.stack)
            return false;
        if (amount > currentBet && amount - currentBet < minRaise && amount !== player.stack)
            return false;
        return true;
    }
    getMinRaise(currentBet, bb) {
        return currentBet + bb * 2;
    }
    getCallAmount(player, currentBet) {
        return Math.min(currentBet - player.bet, player.stack);
    }
}
exports.BetManager = BetManager;
