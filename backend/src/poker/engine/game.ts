import { prisma } from '../../database/client';
import { logger } from '../../utils/logger';
import { SYSTEM_CONFIG } from '../../config/constants';
import { Deck } from '../evaluator/deck';
import { HandEvaluator } from '../evaluator/hand';
import { SidePotEngine } from '../sidepots';
import { ShowdownEngine } from '../showdown';
import { PokerTimer } from '../timer';

export interface Player {
  id: string;
  userId: string;
  position: number;
  holeCards: string[];
  stack: number;
  bet: number;
  isActive: boolean;
  isAllIn: boolean;
  hasFolded: boolean;
  isSittingOut: boolean;
  timeoutTimer?: NodeJS.Timeout;
}

export interface GameState {
  id: string;
  tableId: string;
  status: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
  players: Player[];
  communityCards: string[];
  pot: number;
  sidePots: { amount: number; eligiblePlayers: string[] }[];
  dealerIndex: number;
  smallBlindIndex: number;
  bigBlindIndex: number;
  currentPlayerIndex: number;
  currentBet: number;
  lastRaiser: string | null;
  timer: PokerTimer;
  handHistory: string[];
  startedAt: Date;
}

export class PokerGame {
  private state: GameState;
  private deck: Deck;
  private sidePotEngine: SidePotEngine;
  private showdownEngine: ShowdownEngine;

  constructor(gameId: string, tableId: string) {
    this.deck = new Deck();
    this.sidePotEngine = new SidePotEngine();
    this.showdownEngine = new ShowdownEngine();
    
    this.state = {
      id: gameId,
      tableId,
      status: 'waiting',
      players: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      dealerIndex: 0,
      smallBlindIndex: 0,
      bigBlindIndex: 0,
      currentPlayerIndex: 0,
      currentBet: 0,
      lastRaiser: null,
      timer: new PokerTimer(SYSTEM_CONFIG.actionTimeout),
      handHistory: [],
      startedAt: new Date()
    };
  }

  async initGame(): Promise<GameState> {
    const table = await prisma.pokerTable.findUnique({
      where: { id: this.state.tableId },
      include: { seats: { where: { isSitting: true, userId: { not: null } } } }
    });

    if (!table || table.seats.length < 2) {
      throw new Error('Need at least 2 players to start a game');
    }

    const players: Player[] = [];
    for (const seat of table.seats) {
      if (seat.stack && seat.stack > 0) {
        players.push({
          id: seat.id,
          userId: seat.userId!,
          position: seat.position,
          holeCards: [],
          stack: seat.stack,
          bet: 0,
          isActive: true,
          isAllIn: false,
          hasFolded: false,
          isSittingOut: false
        });
      }
    }

    players.sort((a, b) => a.position - b.position);

    const dealerIdx = 0;
    const sbIdx = (dealerIdx + 1) % players.length;
    const bbIdx = (dealerIdx + 2) % players.length;

    this.state.players = players;
    this.state.dealerIndex = dealerIdx;
    this.state.smallBlindIndex = sbIdx;
    this.state.bigBlindIndex = bbIdx;
    this.state.currentPlayerIndex = (bbIdx + 1) % players.length;
    this.state.status = 'preflop';

    return this.startHand();
  }

  async startHand(): Promise<GameState> {
    this.deck.reset();
    this.deck.shuffle();

    this.state.status = 'preflop';
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.lastRaiser = null;
    this.state.handHistory = [];
    this.state.startedAt = new Date();

    for (const player of this.state.players) {
      if (!player.isSittingOut) {
        player.holeCards = [];
        player.bet = 0;
        player.isAllIn = false;
        player.hasFolded = false;
        player.isActive = true;
        player.stack = await this.getPlayerStack(player.userId);
      }
    }

    await this.postBlinds();
    await this.dealHoleCards();

    this.state.currentBet = this.state.players[this.state.bigBlindIndex].bet;
    this.state.currentPlayerIndex = (this.state.bigBlindIndex + 1) % this.state.players.length;

    this.startTimer();
    await this.saveGameState();
    this.broadcast();

    return this.state;
  }

  private async getPlayerStack(userId: string): Promise<number> {
    const seat = await prisma.seat.findFirst({
      where: { userId, isSitting: true }
    });
    return seat?.stack || 0;
  }

  private async postBlinds(): Promise<void> {
    const sb = this.state.players[this.state.smallBlindIndex];
    const bb = this.state.players[this.state.bigBlindIndex];
    const table = await prisma.pokerTable.findUnique({ where: { id: this.state.tableId } });
    const blind = table?.stakes || 100;

    const sbAmount = Math.min(blind / 2, sb.stack);
    sb.stack -= sbAmount;
    sb.bet = sbAmount;
    this.state.pot += sbAmount;
    this.state.handHistory.push(`${sb.userId} posted small blind ${sbAmount}`);

    const bbAmount = Math.min(blind, bb.stack);
    bb.stack -= bbAmount;
    bb.bet = bbAmount;
    this.state.pot += bbAmount;
    this.state.handHistory.push(`${bb.userId} posted big blind ${bbAmount}`);
  }

  private async dealHoleCards(): Promise<void> {
    const shuffled = this.deck.shuffle();
    let idx = 0;
    for (const player of this.state.players) {
      if (!player.isSittingOut && player.stack > 0) {
        player.holeCards = [shuffled[idx++], shuffled[idx++]];
      }
    }
  }

  private startTimer(): void {
    this.state.timer.start(() => {
      this.handleTimeout();
    });
  }

  private async handleTimeout(): Promise<void> {
    const player = this.state.players[this.state.currentPlayerIndex];
    if (player && player.isActive && !player.hasFolded) {
      await this.processAction(player.userId, 'fold');
      this.state.handHistory.push(`${player.userId} auto-folded (timeout)`);
      this.broadcast();
    }
  }

  async processAction(userId: string, action: string, amount?: number): Promise<GameState> {
    const player = this.state.players.find(p => p.userId === userId);
    if (!player) throw new Error('Player not found');

    const current = this.state.players[this.state.currentPlayerIndex];
    if (current.userId !== userId) throw new Error('Not your turn');

    this.state.timer.reset();

    switch (action) {
      case 'fold':
        player.hasFolded = true;
        player.isActive = false;
        this.state.handHistory.push(`${player.userId} folded`);
        break;
      case 'check':
        if (this.state.currentBet > player.bet) {
          throw new Error('Cannot check, must call or raise');
        }
        this.state.handHistory.push(`${player.userId} checked`);
        break;
      case 'call': {
        const callAmount = Math.min(this.state.currentBet - player.bet, player.stack);
        player.stack -= callAmount;
        player.bet += callAmount;
        this.state.pot += callAmount;
        this.state.handHistory.push(`${player.userId} called ${callAmount}`);
        break;
      }
      case 'raise': {
        if (!amount) throw new Error('Raise amount required');
        const raiseAmount = Math.min(amount, player.stack);
        player.stack -= raiseAmount;
        player.bet += raiseAmount;
        this.state.pot += raiseAmount;
        this.state.currentBet = player.bet;
        this.state.lastRaiser = player.userId;
        this.state.handHistory.push(`${player.userId} raised to ${player.bet}`);
        break;
      }
      case 'all_in': {
        const allInAmount = player.stack;
        player.stack = 0;
        player.bet += allInAmount;
        this.state.pot += allInAmount;
        player.isAllIn = true;
        if (player.bet > this.state.currentBet) {
          this.state.currentBet = player.bet;
          this.state.lastRaiser = player.userId;
        }
        this.state.handHistory.push(`${player.userId} went all-in ${allInAmount}`);
        break;
      }
      case 'sit_out':
        player.isSittingOut = true;
        player.isActive = false;
        this.state.handHistory.push(`${player.userId} sat out`);
        break;
      case 'sit_back':
        player.isSittingOut = false;
        player.isActive = true;
        this.state.handHistory.push(`${player.userId} sat back in`);
        break;
    }

    await this.saveGameState();

    const nextAction = this.determineNextAction();
    if (nextAction === 'showdown') {
      await this.showdown();
    } else if (nextAction === 'next_round') {
      await this.advanceRound();
    } else if (nextAction === 'next_player') {
      this.advanceToNextPlayer();
      this.startTimer();
    }

    await this.saveGameState();
    this.broadcast();

    return this.state;
  }

  private determineNextAction(): 'next_player' | 'next_round' | 'showdown' | 'finished' {
    const activePlayers = this.state.players.filter(p => p.isActive && !p.hasFolded && !p.isAllIn && p.stack > 0 && !p.isSittingOut);
    if (activePlayers.length <= 1) {
      return 'showdown';
    }

    if (this.isRoundComplete()) {
      if (this.state.status === 'river') {
        return 'showdown';
      }
      return 'next_round';
    }

    return 'next_player';
  }

  private isRoundComplete(): boolean {
    const activePlayers = this.state.players.filter(p => p.isActive && !p.hasFolded && !p.isAllIn && p.stack > 0 && !p.isSittingOut);
    if (activePlayers.length <= 1) return true;

    return this.state.players.every(p =>
      !p.isActive || p.hasFolded || p.isAllIn ||
      p.bet === this.state.currentBet || p.stack === 0 || p.isSittingOut
    );
  }

  private advanceToNextPlayer(): void {
    const total = this.state.players.length;
    let next = this.state.currentPlayerIndex;

    do {
      next = (next + 1) % total;
    } while (
      !this.state.players[next].isActive ||
      this.state.players[next].hasFolded ||
      this.state.players[next].isAllIn ||
      this.state.players[next].stack === 0 ||
      this.state.players[next].isSittingOut
    );

    this.state.currentPlayerIndex = next;
  }

  private async advanceRound(): Promise<void> {
    const rounds: GameState['status'][] = ['preflop', 'flop', 'turn', 'river'];
    const idx = rounds.indexOf(this.state.status);

    if (idx < rounds.length - 1) {
      this.state.status = rounds[idx + 1];
      const shuffled = this.deck.shuffle();

      if (this.state.status === 'flop') {
        this.state.communityCards = shuffled.slice(0, 3);
        this.state.handHistory.push('Flop dealt');
      } else if (this.state.status === 'turn') {
        this.state.communityCards.push(shuffled[0]);
        this.state.handHistory.push('Turn dealt');
      } else if (this.state.status === 'river') {
        this.state.communityCards.push(shuffled[0]);
        this.state.handHistory.push('River dealt');
      }

      for (const p of this.state.players) {
        if (!p.isSittingOut) p.bet = 0;
      }
      this.state.currentBet = 0;

      let startIdx = (this.state.dealerIndex + 1) % this.state.players.length;
      while (!this.state.players[startIdx].isActive || this.state.players[startIdx].hasFolded || this.state.players[startIdx].isSittingOut) {
        startIdx = (startIdx + 1) % this.state.players.length;
      }
      this.state.currentPlayerIndex = startIdx;
      this.startTimer();
    }
  }

  private async showdown(): Promise<void> {
    const activePlayers = this.state.players.filter(p => p.isActive && !p.hasFolded && !p.isSittingOut);
    if (activePlayers.length === 1) {
      await this.finishHand(activePlayers[0]);
      return;
    }

    this.state.status = 'showdown';
    this.state.sidePots = this.sidePotEngine.calculate(this.state.players, this.state.pot);
    const winners = this.showdownEngine.determineWinners(
      this.state.players.filter(p => p.isActive && !p.hasFolded && !p.isSittingOut),
      this.state.communityCards,
      this.state.sidePots
    );

    await this.distributePots(winners);
    await this.finishHand(winners[0]);
  }

  private async distributePots(winners: { player: Player; amount: number }[]): Promise<void> {
    for (const winner of winners) {
      const wallet = await prisma.wallet.findUnique({
        where: { userId: winner.player.userId }
      });

      if (wallet) {
        const updatedWallet = await prisma.wallet.update({
          where: { userId: winner.player.userId },
          data: {
            balance: wallet.balance + winner.amount,
            locked: wallet.locked - winner.player.stack
          }
        });

        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: winner.amount,
            balance: updatedWallet.balance,
            type: 'WIN',
            referenceId: this.state.id,
            description: `Won hand`
          }
        });

        this.state.handHistory.push(`${winner.player.userId} won ${winner.amount}`);
      }
    }
  }

  private async finishHand(winner: Player): Promise<void> {
    this.state.status = 'finished';
    this.state.timer.stop();

    const totalPot = this.state.pot + this.state.sidePots.reduce((sum, p) => sum + p.amount, 0);
    const rake = Math.min(Math.floor(totalPot * 10 / 100), 500);
    const winnings = totalPot - rake;

    if (rake > 0) {
      await prisma.walletTransaction.create({
        data: {
          walletId: 'system',
          amount: rake,
          balance: 0,
          type: 'RAKE',
          referenceId: this.state.id,
          description: `Rake from hand`
        }
      });
    }

    await prisma.game.update({
      where: { id: this.state.id },
      data: {
        status: 'finished',
        finishedAt: new Date(),
        pot: totalPot,
        winnerId: winner.userId,
        communityCards: JSON.stringify(this.state.communityCards)
      }
    });

    this.broadcast();
  }

  private async saveGameState(): Promise<void> {
    for (const player of this.state.players) {
      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: {
          stack: player.stack,
          bet: player.bet,
          isActive: player.isActive,
          isAllIn: player.isAllIn,
          hasFolded: player.hasFolded,
          holeCards: JSON.stringify(player.holeCards)
        }
      });
    }

    await prisma.game.update({
      where: { id: this.state.id },
      data: {
        status: this.state.status,
        pot: this.state.pot,
        communityCards: JSON.stringify(this.state.communityCards)
      }
    });
  }

  private broadcast(): void {
    // Broadcast via Socket.IO
    // This will be handled by the socket layer
  }

  getState(): GameState {
    return this.state;
  }
}
