"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DealerManager = void 0;
class DealerManager {
    rotateDealer(players) {
        const seated = players.filter(p => p.isActive && !p.isSitOut);
        if (seated.length === 0)
            throw new Error('No active players');
        const currentIdx = seated.findIndex(p => p.isDealer);
        const nextIdx = (currentIdx + 1) % seated.length;
        seated.forEach(p => p.isDealer = false);
        seated[nextIdx].isDealer = true;
        return seated[nextIdx].position;
    }
    assignSB(players, dealerIdx) {
        const seated = players.filter(p => p.isActive && !p.isSitOut);
        const idx = seated.findIndex(p => p.position === dealerIdx);
        const sbIdx = (idx + 1) % seated.length;
        return seated[sbIdx].position;
    }
    assignBB(players, dealerIdx) {
        const seated = players.filter(p => p.isActive && !p.isSitOut);
        const idx = seated.findIndex(p => p.position === dealerIdx);
        const bbIdx = (idx + 2) % seated.length;
        return seated[bbIdx].position;
    }
}
exports.DealerManager = DealerManager;
