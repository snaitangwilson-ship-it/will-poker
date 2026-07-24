import { prisma } from '../database/client';
import { Deck, Card } from './Deck';
import { HandEvaluator } from './HandEvaluator';
import { GameStateManager } from './services/GameStateManager';
import { PotManager } from './services/PotManager';
import { ReconnectManager } from '../services/ReconnectManager';
import { logger } from '../services/Logger';

export const userSocketMap = new Map<string, string>();

export interface Player {
  id: string;
  userId: string;
  seatId: string;
  position: number;
  stack: number;
  bet: number;
  isActive: boolean;
  isAllIn: boolean;
  hasFolded: boolean;
  isSitOut: boolean;
  holeCards: Card[];
  isDealer: boolean;
}

export enum GameStatus {
  WAITING = 'WAITING',
  DEALER_ASSIGN = 'DEALER_ASSIGN',
  POST_SB = 'POST_SB',
  POST_BB = 'POST_BB',
  DEAL_HOLE = 'DEAL_HOLE',
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN',
  FINISHED = 'FINISHED',
}

export interface WinnerInfo {
  userId: string;
  handRank: string;
  handCards: Card[];
  kickers: number[];
  amount: number;
}

export interface GameState {
  gameId: string;
  tableId: string;
  status: GameStatus;
  players: Player[];
  communityCards: Card[];
  pot: number;
  sidePots: any[];
  dealerPosition: number;
  sbPosition: number;
  bbPosition: number;
  currentPlayerPosition: number;
  currentBet: number;
  lastRaiseSize: number;
  lastRaiser: string | null;
  actionHistory: string[];
  smallBlind: number;
  bigBlind: number;
  timerRemaining?: number;
  actedThisRound: string[];
  winners?: WinnerInfo[];
  totalRake?: number;
}

export class PokerGame {
  private state: GameState;
  private deck: Deck;
  private stateManager: GameStateManager;
  private io: any;
  private tableId: string;
  private gameId: string;
  private actionTimeout = 20;
  private roundEnded: boolean = false;
  private handRestarting: boolean = false;
  private timer: NodeJS.Timeout | null = null;
  private timerTickInterval: NodeJS.Timeout | null = null;
  private timeRemaining: number = this.actionTimeout;
  private cardIndex: number = 0;
  private shuffledDeck: Card[] = [];

  private reconnectManager = ReconnectManager.getInstance();

  constructor(gameId: string, tableId: string, smallBlind: number, bigBlind: number, io: any) {
    this.gameId = gameId;
    this.tableId = tableId;
    this.io = io;
    this.deck = new Deck();
    this.stateManager = new GameStateManager('WAITING');
    this.state = this.getInitialState(smallBlind, bigBlind);
  }

  private getInitialState(smallBlind: number, bigBlind: number): GameState {
    return {
      gameId: this.gameId,
      tableId: this.tableId,
      status: GameStatus.WAITING,
      players: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      dealerPosition: 0,
      sbPosition: 0,
      bbPosition: 0,
      currentPlayerPosition: 0,
      currentBet: 0,
      lastRaiseSize: 0,
      lastRaiser: null,
      actionHistory: [],
      smallBlind,
      bigBlind,
      actedThisRound: [],
      winners: [],
      totalRake: 0,
    };
  }

  private resetHandState() {
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.lastRaiseSize = 0;
    this.state.lastRaiser = null;
    this.state.actionHistory = [];
    this.state.actedThisRound = [];
    this.state.winners = [];
    this.state.totalRake = 0;
    this.state.timerRemaining = undefined;
    this.roundEnded = false;

    for (const p of this.state.players) {
      p.bet = 0;
      p.hasFolded = false;
      p.isAllIn = false;
      p.isActive = true;
      p.holeCards = [];
    }

    this.deck.reset();
    this.cardIndex = 0;
    this.shuffledDeck = [];
  }

  // ---------- SERVER RESTART RECOVERY ----------
  restoreState(state: any): void {
    this.state = state;
    this.roundEnded = false;
    this.shuffledDeck = state.deck || [];
    this.cardIndex = state.cardIndex || 0;
    if (state.status !== 'finished') {
      this.startTimer();
    }
    logger.info('Game state restored', { gameId: this.gameId });
  }

  async initGame(): Promise<GameState> {
    if (this.handRestarting) {
      console.log('[GAME] Already restarting, skipping duplicate init');
      return this.state;
    }
    this.handRestarting = true;

    try {
      this.resetHandState();
      await this.loadPlayers();

      const table = await prisma.pokerTable.findUnique({
        where: { id: this.tableId },
        include: {} as any
      }) as any;
      const persistedDealer = table?.dealerPosition ?? -1;

      this.assignDealerAndBlinds(persistedDealer);

      await prisma.pokerTable.update({
        where: { id: this.tableId },
        data: { dealerPosition: this.state.dealerPosition }
      });

      this.postBlinds();
      this.shuffledDeck = this.deck.shuffle();
      this.cardIndex = 0;
      this.dealHoleCards();

      this.stateManager.transitionTo(GameStatus.PREFLOP);
      await this.startBettingRound(GameStatus.PREFLOP);

      this.handRestarting = false;
      return this.state;
    } catch (error) {
      console.error('[GAME] initGame error:', error);
      this.handRestarting = false;
      throw error;
    }
  }

  private async loadPlayers() {
    const table = await prisma.pokerTable.findUnique({
      where: { id: this.tableId },
      include: {
        seats: {
          where: { isSitting: true, userId: { not: null } },
          orderBy: { position: 'asc' }
        }
      }
    });
    if (!table) throw new Error('Table not found');
    this.state.players = table.seats
      .filter(seat => seat.stack > 0)
      .map(seat => ({
        id: seat.id,
        userId: seat.userId!,
        seatId: seat.id,
        position: seat.position,
        stack: seat.stack || 0,
        bet: 0,
        isActive: true,
        isAllIn: false,
        hasFolded: false,
        isSitOut: false,
        holeCards: [],
        isDealer: false,
      }));
    this.state.smallBlind = table.smallBlind;
    this.state.bigBlind = table.bigBlind;
    console.log(`[GAME] Loaded ${this.state.players.length} players`);
  }

  private assignDealerAndBlinds(persistedDealer: number = -1) {
    const active = this.state.players.filter(p => p.stack > 0);
    if (active.length < 2) return;

    let dealerPos: number;
    if (active.length === 2) {
      if (persistedDealer !== -1 && active.some(p => p.position === persistedDealer)) {
        dealerPos = persistedDealer;
      } else {
        dealerPos = active[0].position;
      }
      const sbPos = dealerPos;
      const bbPos = active.find(p => p.position !== dealerPos)!.position;
      this.state.dealerPosition = dealerPos;
      this.state.sbPosition = sbPos;
      this.state.bbPosition = bbPos;
    } else {
      let dealerIdx = active.findIndex(p => p.position === persistedDealer);
      if (dealerIdx === -1) dealerIdx = 0;
      const nextIdx = (dealerIdx + 1) % active.length;
      dealerPos = active[nextIdx].position;
      const sbIdx = (nextIdx + 1) % active.length;
      const bbIdx = (nextIdx + 2) % active.length;
      this.state.dealerPosition = dealerPos;
      this.state.sbPosition = active[sbIdx].position;
      this.state.bbPosition = active[bbIdx].position;
    }

    for (const p of this.state.players) {
      p.isDealer = (p.position === this.state.dealerPosition);
    }
    console.log(`[GAME] Dealer: ${this.state.dealerPosition}, SB: ${this.state.sbPosition}, BB: ${this.state.bbPosition}`);
  }

  private postBlinds() {
    const sb = this.state.players.find(p => p.position === this.state.sbPosition);
    const bb = this.state.players.find(p => p.position === this.state.bbPosition);
    if (!sb || !bb) return;
    const sbAmount = Math.min(this.state.smallBlind, sb.stack);
    sb.stack -= sbAmount;
    sb.bet = sbAmount;
    const bbAmount = Math.min(this.state.bigBlind, bb.stack);
    bb.stack -= bbAmount;
    bb.bet = bbAmount;
    this.state.pot = sbAmount + bbAmount;
    this.state.currentBet = bbAmount;
    this.state.lastRaiseSize = this.state.bigBlind;
    this.state.actionHistory.push(`SB ${sb.userId} posts ${sbAmount}, BB ${bb.userId} posts ${bbAmount}`);
  }

  private dealHoleCards() {
    for (const player of this.state.players) {
      if (player.stack > 0 && !player.isSitOut) {
        player.holeCards = [
          this.shuffledDeck[this.cardIndex++],
          this.shuffledDeck[this.cardIndex++]
        ];
      }
    }
    console.log('[GAME] Hole cards dealt');
  }

  private burn() { this.cardIndex++; }

  private dealCommunity(count: number) {
    for (let i = 0; i < count; i++) {
      this.state.communityCards.push(this.shuffledDeck[this.cardIndex++]);
    }
  }

  private async startBettingRound(round: GameStatus) {
    const active = this.state.players.filter(p => p.stack > 0 && !p.hasFolded && !p.isSitOut);
    if (active.length <= 1) {
      await this.endHand();
      return;
    }
    this.state.actedThisRound = [];

    let firstIdx = 0;
    if (round === GameStatus.PREFLOP) {
      const bbPos = this.state.bbPosition;
      const bbIdx = active.findIndex(p => p.position === bbPos);
      firstIdx = (bbIdx + 1) % active.length;
    } else {
      if (active.length === 2) {
        const dealerPos = this.state.dealerPosition;
        firstIdx = active.findIndex(p => p.position === dealerPos);
        if (firstIdx === -1) firstIdx = 0;
      } else {
        const dealerIdx = active.findIndex(p => p.position === this.state.dealerPosition);
        firstIdx = (dealerIdx + 1) % active.length;
      }
    }
    this.state.currentPlayerPosition = active[firstIdx].position;
    this.state.status = round;
    this.broadcastState();
    console.log(`[GAME] ${round} started, first player at position ${this.state.currentPlayerPosition} (${active[firstIdx].userId})`);
    this.startTimer();
  }

  async processAction(userId: string, action: string, amount?: number): Promise<GameState> {
    const player = this.state.players.find(p => p.userId === userId);
    if (!player) throw new Error('Player not found');

    const current = this.state.players.find(p => p.position === this.state.currentPlayerPosition);
    if (current?.userId !== userId) {
      console.log(`[GAME] Not your turn. Current: ${current?.userId}, You: ${userId}`);
      throw new Error('Not your turn');
    }
    if (this.roundEnded) throw new Error('Round already ended');

    // Stop timer – player is acting
    this.stopTimer();

    console.log(`[GAME] ${userId} ${action}${amount ? ' ' + amount : ''}`);
    switch (action) {
      case 'fold':
        player.hasFolded = true;
        player.isActive = false;
        this.state.actionHistory.push(`${userId} folds`);
        this.state.actedThisRound.push(userId);
        break;
      case 'check':
        if (this.state.currentBet > player.bet) throw new Error('Cannot check, must call');
        this.state.actionHistory.push(`${userId} checks`);
        this.state.actedThisRound.push(userId);
        break;
      case 'call': {
        const callAmount = Math.min(this.state.currentBet - player.bet, player.stack);
        if (callAmount <= 0) throw new Error('Already called');
        player.stack -= callAmount;
        player.bet += callAmount;
        this.state.pot += callAmount;
        this.state.actionHistory.push(`${userId} calls ${callAmount}`);
        this.state.actedThisRound.push(userId);
        break;
      }
      case 'raise': {
        if (!amount) throw new Error('Amount required');
        const totalBet = amount;
        const raiseAmount = totalBet - player.bet;
        if (raiseAmount <= 0) throw new Error('Raise amount must be positive');
        const minRaise = this.state.currentBet + this.state.lastRaiseSize;
        if (totalBet < minRaise) {
          throw new Error(`Minimum raise is ${minRaise}`);
        }
        if (totalBet > player.stack + player.bet) throw new Error('Insufficient chips');
        const amountToAdd = totalBet - player.bet;
        player.stack -= amountToAdd;
        player.bet = totalBet;
        this.state.pot += amountToAdd;
        this.state.currentBet = totalBet;
        this.state.lastRaiseSize = raiseAmount;
        this.state.lastRaiser = userId;
        this.state.actionHistory.push(`${userId} raises to ${totalBet}`);
        this.state.actedThisRound = [userId];
        break;
      }
      case 'all_in': {
        const allInAmount = player.stack;
        if (allInAmount <= 0) throw new Error('Already all-in');
        const totalBet = player.bet + allInAmount;
        player.stack = 0;
        player.bet = totalBet;
        this.state.pot += allInAmount;
        player.isAllIn = true;
        if (totalBet > this.state.currentBet) {
          this.state.currentBet = totalBet;
          this.state.lastRaiseSize = totalBet - (this.state.lastRaiser ? this.state.players.find(p => p.userId === this.state.lastRaiser)?.bet || 0 : 0);
          this.state.lastRaiser = userId;
          this.state.actedThisRound = [userId];
        } else {
          this.state.actedThisRound.push(userId);
        }
        this.state.actionHistory.push(`${userId} goes all-in ${allInAmount}`);
        break;
      }
      default:
        throw new Error('Invalid action');
    }

    // Update seat in DB
    prisma.seat.update({
      where: { id: player.seatId },
      data: { stack: player.stack }
    }).catch(console.error);

    // Advance to next player
    await this.advanceToNextPlayer();

    // If hand not over, start timer for next player
    if (!this.roundEnded) {
      this.startTimer();
      this.broadcastState();
    }

    return this.state;
  }

  private async advanceToNextPlayer() {
    // Get all players who can still act (have chips, haven't folded, not all-in, not sitting out)
    const active = this.state.players.filter(p =>
      p.stack > 0 && !p.hasFolded && !p.isAllIn && !p.isSitOut
    );

    console.log(`[GAME] advanceToNextPlayer – active players: ${active.map(p => p.userId + '@' + p.position).join(', ')}`);

    if (active.length <= 1) {
      console.log('[GAME] Only one active player – ending hand');
      await this.endHand();
      this.roundEnded = true;
      return;
    }

    // Find the current player index
    const currentPlayer = this.state.players.find(p => p.position === this.state.currentPlayerPosition);
    let currentIdx = this.state.players.indexOf(currentPlayer!);
    if (currentIdx === -1) {
      // Fallback: use the first active
      currentIdx = this.state.players.indexOf(active[0]);
    }

    // Look for the next active player (skip folded, all-in, etc.)
    let nextIdx = (currentIdx + 1) % this.state.players.length;
    let attempts = 0;
    while (
      attempts < this.state.players.length &&
      (this.state.players[nextIdx].stack <= 0 ||
       this.state.players[nextIdx].hasFolded ||
       this.state.players[nextIdx].isAllIn ||
       this.state.players[nextIdx].isSitOut)
    ) {
      nextIdx = (nextIdx + 1) % this.state.players.length;
      attempts++;
    }

    if (attempts >= this.state.players.length) {
      // No active players left – end the hand
      console.log('[GAME] No active players found – ending hand');
      await this.endHand();
      this.roundEnded = true;
      return;
    }

    // Update the current player position
    const newPosition = this.state.players[nextIdx].position;
    this.state.currentPlayerPosition = newPosition;
    console.log(`[GAME] ✅ Turn advanced to position ${newPosition} (user: ${this.state.players[nextIdx].userId})`);

    // Check if the betting round is complete
    if (this.isRoundComplete()) {
      console.log('[GAME] Round complete – advancing to next street');
      await this.advanceToNextRound();
    }
  }

  private isRoundComplete(): boolean {
    const active = this.state.players.filter(p =>
      p.stack > 0 && !p.hasFolded && !p.isAllIn && !p.isSitOut
    );
    if (active.length <= 1) return true;
    const allActed = active.every(p => this.state.actedThisRound.includes(p.userId));
    if (!allActed) return false;
    const allBetEqual = active.every(p => p.bet === this.state.currentBet);
    return allBetEqual;
  }

  private async advanceToNextRound() {
    this.stopTimer();
    const streets = [
      GameStatus.PREFLOP,
      GameStatus.FLOP,
      GameStatus.TURN,
      GameStatus.RIVER,
      GameStatus.SHOWDOWN
    ];
    const idx = streets.indexOf(this.state.status);
    if (idx < streets.length - 1) {
      const nextStatus = streets[idx + 1];
      this.state.status = nextStatus;

      if (nextStatus === GameStatus.FLOP) {
        this.burn();
        this.dealCommunity(3);
      } else if (nextStatus === GameStatus.TURN) {
        this.burn();
        this.dealCommunity(1);
      } else if (nextStatus === GameStatus.RIVER) {
        this.burn();
        this.dealCommunity(1);
      }

      // Reset bets for the new round
      for (const p of this.state.players) {
        p.bet = 0;
      }
      this.state.currentBet = 0;
      this.state.lastRaiseSize = 0;
      this.state.lastRaiser = null;
      this.state.actedThisRound = [];

      // Set first player to act (UTG = after dealer; heads-up: SB acts first)
      const active = this.state.players.filter(p => p.stack > 0 && !p.hasFolded && !p.isSitOut);
      if (active.length > 1) {
        let firstIdx = 0;
        if (active.length === 2) {
          const dealerPos = this.state.dealerPosition;
          firstIdx = active.findIndex(p => p.position === dealerPos);
          if (firstIdx === -1) firstIdx = 0;
        } else {
          const dealerIdx = active.findIndex(p => p.position === this.state.dealerPosition);
          firstIdx = (dealerIdx + 1) % active.length;
        }
        this.state.currentPlayerPosition = active[firstIdx].position;
        console.log(`[GAME] New round ${nextStatus} – first player at position ${this.state.currentPlayerPosition}`);
      }

      this.broadcastState();
      console.log(`[GAME] Advanced to ${nextStatus}`);
      this.startTimer();
    } else if (this.state.status === GameStatus.RIVER) {
      await this.showdown();
    }
  }

  private async showdown() {
    this.stopTimer();
    const active = this.state.players.filter(p => p.stack > 0 && !p.hasFolded && !p.isSitOut);
    if (active.length === 0) {
      await this.endHand();
      return;
    }

    const playerData = active.map(p => ({
      userId: p.userId,
      stack: p.stack,
      bet: p.bet,
      isAllIn: p.isAllIn,
      hasFolded: p.hasFolded,
    }));
    const pots = PotManager.calculatePots(playerData);

    const rakeCap = this.state.bigBlind * 5;
    let totalRake = 0;
    const potsAfterRake = pots.map(pot => {
      const rake = Math.min(Math.floor(pot.amount * 0.1), rakeCap);
      totalRake += rake;
      return { ...pot, amount: pot.amount - rake };
    });
    this.state.totalRake = totalRake;
    console.log(`[RAKE] Total rake: ${totalRake}`);

    const holeCardsMap = new Map<string, Card[]>();
    for (const p of active) holeCardsMap.set(p.userId, p.holeCards);
    const winnings = PotManager.distributePots(potsAfterRake, this.state.communityCards, holeCardsMap);

    const winners: WinnerInfo[] = [];
    for (const [userId, amount] of winnings) {
      const player = this.state.players.find(p => p.userId === userId);
      if (player) {
        const result = HandEvaluator.evaluate(player.holeCards, this.state.communityCards);
        winners.push({
          userId,
          handRank: result.rank,
          handCards: result.cards,
          kickers: result.kickers,
          amount
        });
        player.stack += amount;
        this.state.actionHistory.push(`${userId} wins ₹${amount} with ${result.rank}`);
      }
    }
    this.state.winners = winners;

    await this.endHand();
  }

  private async endHand() {
    this.stopTimer();
    this.state.status = GameStatus.FINISHED;
    this.roundEnded = true;
    this.broadcastState();
    console.log('[GAME] Hand finished');

    try {
      const boardJson = this.state.communityCards;
      const playersJson = this.state.players.map(p => ({
        userId: p.userId,
        stack: p.stack,
        bet: p.bet,
        holeCards: p.holeCards,
        hasFolded: p.hasFolded,
        isAllIn: p.isAllIn,
      }));
      const actionsJson = this.state.actionHistory;
      const winnersJson = this.state.winners || [];

      await prisma.handHistory.create({
        data: {
          gameId: this.gameId,
          tableId: this.tableId,
          players: playersJson as any,
          actions: actionsJson as any,
          pot: this.state.pot,
          board: boardJson,
          winnerId: winnersJson[0]?.userId || '',
          winnerHand: winnersJson[0]?.handRank || '',
          winners: winnersJson as any,
          dealerId: this.state.players.find(p => p.isDealer)?.userId || '',
          rake: this.state.totalRake || 0,
        }
      });
    } catch (error) {
      console.error('[GAME] Failed to archive hand:', error);
    }

    this.handRestarting = false;
    setTimeout(async () => {
      if (!this.handRestarting) {
        await this.initGame();
      }
    }, 3000);
  }

  // ---------- TIMER ----------
  private startTimer() {
    this.stopTimer(); // always clear any existing timer
    const currentPlayer = this.state.players.find(p => p.position === this.state.currentPlayerPosition);
    if (!currentPlayer) {
      console.log('[TIMER] No current player, timer not started');
      return;
    }
    console.log(`[TIMER] Starting timer for ${currentPlayer.userId}`);
    this.timeRemaining = this.actionTimeout;
    this.emitTimerTick(this.timeRemaining);

    // Tick every second
    this.timerTickInterval = setInterval(() => {
      this.timeRemaining -= 1;
      this.emitTimerTick(this.timeRemaining);
      if (this.timeRemaining <= 0) {
        this.handleTimerExpiry();
      }
    }, 1000);

    // Backup timeout (in case interval is delayed)
    this.timer = setTimeout(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining = 0;
        this.emitTimerTick(0);
        this.handleTimerExpiry();
      }
    }, this.actionTimeout * 1000);
  }

  private stopTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.timerTickInterval) {
      clearInterval(this.timerTickInterval);
      this.timerTickInterval = null;
    }
  }

  private emitTimerTick(remaining: number) {
    const currentPlayer = this.state.players.find(p => p.position === this.state.currentPlayerPosition);
    if (currentPlayer) {
      this.io.to(`table:${this.tableId}`).emit('timer:tick', {
        userId: currentPlayer.userId,
        remaining
      });
      this.io.to(currentPlayer.userId).emit('timer:tick', {
        userId: currentPlayer.userId,
        remaining
      });
    }
  }

  private async handleTimerExpiry() {
    this.stopTimer();
    const currentPlayer = this.state.players.find(p => p.position === this.state.currentPlayerPosition);
    if (!currentPlayer) {
      console.log('[TIMER] No current player, skipping expiry');
      return;
    }
    if (this.roundEnded) {
      console.log('[TIMER] Round ended, skipping expiry');
      return;
    }

    console.log(`[TIMER] ⏰ Timer expired for ${currentPlayer.userId}`);
    const needsCall = this.state.currentBet > currentPlayer.bet;

    try {
      if (needsCall) {
        console.log(`[TIMER] Auto-folding ${currentPlayer.userId} (needs call)`);
        await this.processAction(currentPlayer.userId, 'fold');
      } else {
        console.log(`[TIMER] Auto-checking ${currentPlayer.userId}`);
        await this.processAction(currentPlayer.userId, 'check');
      }
    } catch (error) {
      console.error(`[TIMER] Auto-action failed:`, error);
      // Force fold as fallback
      currentPlayer.hasFolded = true;
      currentPlayer.isActive = false;
      this.state.actionHistory.push(`${currentPlayer.userId} auto-folded (timer fallback)`);
      await this.advanceToNextPlayer();
      // startTimer will be called by processAction or we can call it here
      if (!this.roundEnded) {
        this.startTimer();
        this.broadcastState();
      }
    }
  }

  // ---------- BROADCAST ----------
  private broadcastState() {
    for (const player of this.state.players) {
      const pState = {
        ...this.state,
        players: this.state.players.map(p => ({
          ...p,
          holeCards: p.userId === player.userId ? p.holeCards : ['🃏', '🃏']
        }))
      };
      this.io.to(player.userId).emit('game:state', pState);
    }
    const spectatorState = {
      ...this.state,
      players: this.state.players.map(p => ({ ...p, holeCards: ['🃏', '🃏'] }))
    };
    this.io.to(`table:${this.tableId}`).emit('game:state:spectator', spectatorState);

    // Persist state for reconnect
    this.reconnectManager.saveGameState(this.gameId, this.state);
  }

  getState(): GameState {
    return this.state;
  }

  dispose() {
    this.stopTimer();
  }
}