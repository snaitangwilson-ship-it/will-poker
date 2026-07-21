import { prisma } from '../database/client';
import { Deck, Card } from './Deck';
import { HandEvaluator } from './HandEvaluator';

export interface GamePlayer {
  id: string;
  userId: string;
  seatId: string;
  position: number;
  holeCards: Card[];
  stack: number;
  bet: number;
  isActive: boolean;
  isAllIn: boolean;
  hasFolded: boolean;
  isSitOut: boolean;
  timeoutId?: NodeJS.Timeout;
}

export interface GameState {
  gameId: string;
  tableId: string;
  status: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'finished';
  players: GamePlayer[];
  communityCards: Card[];
  pot: number;
  sidePots: { amount: number; eligiblePlayers: string[] }[];
  dealerPosition: number;
  currentPlayerPosition: number;
  smallBlindPosition: number;
  bigBlindPosition: number;
  currentBet: number;
  lastRaiser: string | null;
  actionHistory: string[];
  startedAt: Date;
  smallBlind: number;
  bigBlind: number;
}

export class PokerGame {
  private gameId: string;
  private tableId: string;
  private state: GameState;
  private deck: Deck;
  private timeoutId: NodeJS.Timeout | null = null;
  private ACTION_TIMEOUT = 30000;
  private io: any;
  private log: (msg: string) => void;

  constructor(gameId: string, tableId: string, smallBlind: number, bigBlind: number, io: any) {
    console.log(`🔧 [CONSTRUCTOR] Creating PokerGame for ${gameId} on table ${tableId}`);
    this.gameId = gameId;
    this.tableId = tableId;
    this.io = io;
    this.deck = new Deck();
    this.log = (msg: string) => console.log(`[PokerGame ${gameId}] ${msg}`);
    this.state = {
      gameId,
      tableId,
      status: 'waiting',
      players: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      dealerPosition: 0,
      currentPlayerPosition: 0,
      smallBlindPosition: 0,
      bigBlindPosition: 0,
      currentBet: 0,
      lastRaiser: null,
      actionHistory: [],
      startedAt: new Date(),
      smallBlind,
      bigBlind
    };
    this.log('✅ PokerGame instance created');
  }

  async initGame(): Promise<GameState> {
    console.log(`🚀 [INIT] initGame() called for game ${this.gameId}`);
    this.log('🎯 initGame() called');
    
    console.log(`📊 [INIT] Fetching table ${this.tableId} from database...`);
    const table = await prisma.pokerTable.findUnique({
      where: { id: this.tableId },
      include: { seats: { where: { isSitting: true, userId: { not: null } } } }
    });

    console.log(`📊 [INIT] Table found: ${table?.name || 'NOT FOUND'}, seats: ${table?.seats.length || 0}`);

    if (!table || table.seats.length < 2) {
      console.log(`❌ [INIT] Not enough players. Found ${table?.seats.length || 0}, need 2+`);
      this.state.status = 'waiting';
      this.broadcast();
      return this.state;
    }

    console.log(`👤 [INIT] Building player list from ${table.seats.length} seats`);
    const players: GamePlayer[] = [];
    for (const seat of table.seats) {
      console.log(`   👤 Seat ${seat.position}: userId=${seat.userId}, stack=${seat.stack}, isSitOut=${seat.isSitOut}`);
      if (seat.stack && seat.stack > 0 && !seat.isSitOut) {
        players.push({
          id: seat.id,
          userId: seat.userId!,
          seatId: seat.id,
          position: seat.position,
          holeCards: [],
          stack: seat.stack,
          bet: 0,
          isActive: true,
          isAllIn: false,
          hasFolded: false,
          isSitOut: false
        });
      }
    }

    console.log(`👤 [INIT] ${players.length} active players found`);

    if (players.length < 2) {
      console.log(`❌ [INIT] Less than 2 active players (${players.length})`);
      this.state.status = 'waiting';
      this.broadcast();
      return this.state;
    }

    players.sort((a, b) => a.position - b.position);
    console.log(`👤 [INIT] Players sorted by position: ${players.map(p => p.userId).join(', ')}`);

    const dealerPos = (this.state.dealerPosition + 1) % players.length;
    const sbPos = (dealerPos + 1) % players.length;
    const bbPos = (dealerPos + 2) % players.length;

    console.log(`🎯 [INIT] Positions: Dealer=${dealerPos}, SB=${sbPos}, BB=${bbPos}`);

    this.state.players = players;
    this.state.dealerPosition = dealerPos;
    this.state.smallBlindPosition = sbPos;
    this.state.bigBlindPosition = bbPos;
    this.state.currentPlayerPosition = (bbPos + 1) % players.length;
    this.state.status = 'preflop';

    console.log(`✅ [INIT] State set: status=${this.state.status}, currentPlayer=${this.state.currentPlayerPosition}`);
    console.log(`🚀 [INIT] Calling startHand()...`);
    return this.startHand();
  }

  async startHand(): Promise<GameState> {
    console.log(`🃏 [HAND] startHand() called for game ${this.gameId}`);
    this.deck.reset();
    const shuffled = this.deck.shuffle();
    console.log(`📦 [HAND] Deck shuffled, ${shuffled.length} cards`);

    for (const player of this.state.players) {
      if (!player.isSitOut) {
        player.holeCards = [];
        player.bet = 0;
        player.isAllIn = false;
        player.hasFolded = false;
        player.isActive = true;
        const seat = await prisma.seat.findUnique({
          where: { id: player.seatId }
        });
        if (seat) {
          player.stack = seat.stack;
          console.log(`👤 [HAND] Player ${player.userId} reset, stack: ${player.stack}`);
        }
      }
    }

    console.log(`💰 [HAND] Collecting blinds...`);
    await this.collectBlinds();

    console.log(`🃏 [HAND] Dealing hole cards...`);
    await this.dealHoleCards();

    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.lastRaiser = null;
    this.state.actionHistory = [];
    this.state.status = 'preflop';
    this.state.startedAt = new Date();

    const bbPos = this.state.bigBlindPosition;
    let firstActive = (bbPos + 1) % this.state.players.length;
    let attempts = 0;
    while ((!this.state.players[firstActive].isActive || this.state.players[firstActive].isSitOut) && attempts < this.state.players.length) {
      firstActive = (firstActive + 1) % this.state.players.length;
      attempts++;
    }
    this.state.currentPlayerPosition = firstActive;

    console.log(`✅ [HAND] Hand ready! Status: ${this.state.status}, first to act: position ${firstActive}`);
    console.log(`📊 [HAND] Pot: ${this.state.pot}, Current bet: ${this.state.currentBet}`);
    console.log(`👤 [HAND] Players: ${this.state.players.map(p => `${p.userId}(${p.stack})`).join(', ')}`);

    this.startActionTimer();
    await this.saveGameState();
    
    console.log(`📤 [HAND] Broadcasting game state...`);
    this.broadcast();
    console.log(`✅ [HAND] startHand() completed successfully`);

    return this.state;
  }

  private async collectBlinds(): Promise<void> {
    console.log(`💰 [BLINDS] Collecting blinds for game ${this.gameId}`);
    const sb = this.state.players[this.state.smallBlindPosition];
    const bb = this.state.players[this.state.bigBlindPosition];
    
    console.log(`   SB: ${sb.userId} stack=${sb.stack}, bet=${sb.bet}`);
    console.log(`   BB: ${bb.userId} stack=${bb.stack}, bet=${bb.bet}`);
    
    const sbAmount = Math.min(this.state.smallBlind, sb.stack);
    sb.stack -= sbAmount;
    sb.bet = sbAmount;
    this.state.pot += sbAmount;
    this.state.actionHistory.push(`${sb.userId} posted small blind ${sbAmount}`);
    console.log(`💳 [BLINDS] SB: ${sb.userId} posted ${sbAmount}`);

    const bbAmount = Math.min(this.state.bigBlind, bb.stack);
    bb.stack -= bbAmount;
    bb.bet = bbAmount;
    this.state.pot += bbAmount;
    this.state.currentBet = bbAmount;
    this.state.actionHistory.push(`${bb.userId} posted big blind ${bbAmount}`);
    console.log(`💳 [BLINDS] BB: ${bb.userId} posted ${bbAmount}`);
    console.log(`💰 [BLINDS] Pot: ${this.state.pot}, Current bet: ${this.state.currentBet}`);
  }

  private async dealHoleCards(): Promise<void> {
    console.log(`🃏 [DEAL] Dealing hole cards...`);
    const shuffled = this.deck.shuffle();
    let idx = 0;
    for (const player of this.state.players) {
      if (!player.isSitOut && player.stack > 0) {
        player.holeCards = [shuffled[idx++], shuffled[idx++]];
        console.log(`🃏 [DEAL] ${player.userId}: ${player.holeCards.join(', ')}`);
      }
    }
    console.log(`✅ [DEAL] ${idx} cards dealt, remaining: ${shuffled.length - idx}`);
  }

  private startActionTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    this.timeoutId = setTimeout(async () => {
      const currentPlayer = this.state.players[this.state.currentPlayerPosition];
      if (currentPlayer && currentPlayer.isActive && !currentPlayer.hasFolded && !currentPlayer.isAllIn) {
        console.log(`⏰ [TIMEOUT] Auto-folding ${currentPlayer.userId}`);
        await this.processAction(currentPlayer.userId, 'fold');
        this.state.actionHistory.push(`${currentPlayer.userId} auto-folded (timeout)`);
        this.broadcast();
      }
    }, this.ACTION_TIMEOUT);
  }

  async processAction(userId: string, action: string, amount?: number): Promise<GameState> {
    console.log(`🎮 [ACTION] ${userId} -> ${action}${amount ? ' ' + amount : ''}`);
    
    const player = this.state.players.find(p => p.userId === userId);
    if (!player) {
      console.log(`❌ [ACTION] Player ${userId} not found`);
      throw new Error('Player not found');
    }

    const current = this.state.players[this.state.currentPlayerPosition];
    if (current.userId !== userId) {
      console.log(`❌ [ACTION] Not your turn. Current: ${current.userId}`);
      throw new Error('Not your turn');
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`🎮 [ACTION] Processing ${action} for ${userId}`);
    switch (action) {
      case 'fold':
        player.hasFolded = true;
        player.isActive = false;
        this.state.actionHistory.push(`${player.userId} folded`);
        console.log(`🔴 [ACTION] ${userId} folded`);
        break;
      case 'check':
        if (this.state.currentBet > player.bet) {
          console.log(`❌ [ACTION] Cannot check, must call or raise`);
          throw new Error('Cannot check, must call or raise');
        }
        this.state.actionHistory.push(`${player.userId} checked`);
        console.log(`✅ [ACTION] ${userId} checked`);
        break;
      case 'call': {
        const callAmount = Math.min(this.state.currentBet - player.bet, player.stack);
        player.stack -= callAmount;
        player.bet += callAmount;
        this.state.pot += callAmount;
        this.state.actionHistory.push(`${player.userId} called ${callAmount}`);
        console.log(`✅ [ACTION] ${userId} called ${callAmount}`);
        break;
      }
      case 'bet':
      case 'raise': {
        if (!amount || amount <= 0) {
          console.log(`❌ [ACTION] Invalid amount: ${amount}`);
          throw new Error('Amount required');
        }
        const raiseAmount = Math.min(amount, player.stack);
        player.stack -= raiseAmount;
        player.bet += raiseAmount;
        this.state.pot += raiseAmount;
        this.state.currentBet = player.bet;
        this.state.lastRaiser = player.userId;
        this.state.actionHistory.push(`${player.userId} ${action}ed to ${player.bet}`);
        console.log(`✅ [ACTION] ${userId} ${action}ed to ${player.bet}`);
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
        this.state.actionHistory.push(`${player.userId} went all-in ${allInAmount}`);
        console.log(`✅ [ACTION] ${userId} all-in ${allInAmount}`);
        break;
      }
    }

    await this.saveGameState();

    if (this.isRoundComplete()) {
      console.log(`🔁 [ACTION] Round complete, advancing...`);
      await this.advanceToNextRound();
    } else {
      await this.advanceToNextPlayer();
      this.startActionTimer();
    }

    await this.saveGameState();
    this.broadcast();

    return this.state;
  }

  private async advanceToNextPlayer(): Promise<void> {
    const total = this.state.players.length;
    let next = this.state.currentPlayerPosition;

    do {
      next = (next + 1) % total;
    } while (
      !this.state.players[next].isActive ||
      this.state.players[next].hasFolded ||
      this.state.players[next].isAllIn ||
      this.state.players[next].stack === 0 ||
      this.state.players[next].isSitOut
    );

    this.state.currentPlayerPosition = next;
    console.log(`👤 [NEXT] Next player: position ${next} (${this.state.players[next].userId})`);
  }

  private isRoundComplete(): boolean {
    const active = this.state.players.filter(p => 
      p.isActive && !p.hasFolded && !p.isAllIn && p.stack > 0 && !p.isSitOut
    );
    
    if (active.length <= 1) {
      console.log(`🔁 [ROUND] Round complete: ${active.length} active players`);
      return true;
    }

    const allActed = this.state.players.every(p =>
      !p.isActive || 
      p.hasFolded || 
      p.isAllIn || 
      p.bet === this.state.currentBet || 
      p.stack === 0 ||
      p.isSitOut
    );

    if (allActed) {
      console.log(`🔁 [ROUND] Round complete: all players acted`);
    }
    return allActed;
  }

  private async advanceToNextRound(): Promise<void> {
    const rounds: GameState['status'][] = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = rounds.indexOf(this.state.status);

    if (idx < rounds.length - 1) {
      this.state.status = rounds[idx + 1];
      console.log(`🔁 [ROUND] Advancing to ${this.state.status}`);
      const shuffled = this.deck.shuffle();

      if (this.state.status === 'flop') {
        this.state.communityCards = shuffled.slice(0, 3);
        this.state.actionHistory.push('Flop dealt');
        console.log(`🃏 [ROUND] Flop: ${this.state.communityCards.join(', ')}`);
      } else if (this.state.status === 'turn') {
        this.state.communityCards.push(shuffled[0]);
        this.state.actionHistory.push('Turn dealt');
        console.log(`🃏 [ROUND] Turn: ${shuffled[0]}`);
      } else if (this.state.status === 'river') {
        this.state.communityCards.push(shuffled[0]);
        this.state.actionHistory.push('River dealt');
        console.log(`🃏 [ROUND] River: ${shuffled[0]}`);
      }

      for (const p of this.state.players) {
        if (!p.isSitOut) p.bet = 0;
      }
      this.state.currentBet = 0;

      let startIdx = (this.state.dealerPosition + 1) % this.state.players.length;
      let attempts = 0;
      while ((!this.state.players[startIdx].isActive || this.state.players[startIdx].hasFolded || this.state.players[startIdx].isSitOut) && attempts < this.state.players.length) {
        startIdx = (startIdx + 1) % this.state.players.length;
        attempts++;
      }
      this.state.currentPlayerPosition = startIdx;
      this.startActionTimer();

      if (this.state.status === 'showdown') {
        await this.showdown();
      }
    }
  }

  private async showdown(): Promise<void> {
    console.log(`🏆 [SHOWDOWN] Starting showdown!`);
    const active = this.state.players.filter(p => p.isActive && !p.hasFolded && !p.isSitOut);
    
    if (active.length === 1) {
      console.log(`🏆 [SHOWDOWN] Only one player left: ${active[0].userId}`);
      await this.finishHand(active[0]);
      return;
    }

    this.state.sidePots = this.calculateSidePots();
    console.log(`📊 [SHOWDOWN] Side pots: ${JSON.stringify(this.state.sidePots)}`);

    const results = active.map(p => ({
      player: p,
      result: HandEvaluator.evaluate(p.holeCards, this.state.communityCards)
    }));

    console.log(`📊 [SHOWDOWN] Hand results:`);
    results.forEach(r => {
      console.log(`   ${r.player.userId}: ${r.result.rank} (${r.result.rankValue})`);
    });

    for (const sidePot of this.state.sidePots) {
      const eligible = results.filter(r => 
        sidePot.eligiblePlayers.includes(r.player.userId)
      );

      if (eligible.length === 0) continue;

      eligible.sort((a, b) => HandEvaluator.compareHands(b.result, a.result));
      const best = eligible[0];
      const winners = eligible.filter(e => 
        HandEvaluator.compareHands(e.result, best.result) === 0
      );

      const share = Math.floor(sidePot.amount / winners.length);
      for (const winner of winners) {
        console.log(`🏆 [SHOWDOWN] ${winner.player.userId} wins ${share} from side pot (${best.result.rank})`);
        await this.awardPlayer(winner.player, share);
        this.state.actionHistory.push(`${winner.player.userId} won ${share} (${best.result.rank})`);
      }
    }
  }

  private calculateSidePots(): { amount: number; eligiblePlayers: string[] }[] {
    const allInPlayers = this.state.players.filter(p => p.isAllIn);
    if (allInPlayers.length === 0) {
      return [{ 
        amount: this.state.pot, 
        eligiblePlayers: this.state.players.filter(p => p.isActive && !p.hasFolded).map(p => p.userId) 
      }];
    }

    const sidePots: { amount: number; eligiblePlayers: string[] }[] = [];
    let remainingPlayers = this.state.players.filter(p => p.isActive && !p.hasFolded);
    let remainingPot = this.state.pot;

    allInPlayers.sort((a, b) => a.bet - b.bet);

    for (const allIn of allInPlayers) {
      const contribution = allIn.bet;
      const eligible = remainingPlayers.filter(p => p.bet >= contribution);
      
      if (eligible.length > 0) {
        const amount = contribution * eligible.length;
        sidePots.push({ amount, eligiblePlayers: eligible.map(p => p.userId) });
        remainingPot -= amount;
        remainingPlayers = eligible;
      }
    }

    if (remainingPot > 0 && remainingPlayers.length > 0) {
      sidePots.push({ 
        amount: remainingPot, 
        eligiblePlayers: remainingPlayers.map(p => p.userId) 
      });
    }

    return sidePots;
  }

  private async awardPlayer(player: GamePlayer, amount: number): Promise<void> {
    console.log(`💰 [AWARD] Awarding ${amount} to ${player.userId}`);
    const wallet = await prisma.wallet.findUnique({
      where: { userId: player.userId }
    });

    if (wallet) {
      await prisma.wallet.update({
        where: { userId: player.userId },
        data: {
          balance: wallet.balance + amount,
          locked: wallet.locked - player.stack
        }
      });

      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: amount,
          balance: wallet.balance + amount,
          type: 'WIN',
          referenceId: this.gameId,
          description: `Won hand at ${this.gameId}`
        }
      });
    }
  }

  private async finishHand(winner: GamePlayer): Promise<void> {
    console.log(`🏆 [FINISH] Hand finished! Winner: ${winner.userId}`);
    await this.awardPlayer(winner, this.state.pot);
    this.state.actionHistory.push(`${winner.userId} won ${this.state.pot}`);
    this.state.status = 'finished';

    await this.saveGameState();
    this.broadcast();

    setTimeout(() => {
      console.log(`🔄 [FINISH] Starting next hand...`);
      this.initGame();
    }, 5000);

    console.log(`✅ [FINISH] Hand finished successfully`);
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
      where: { id: this.gameId },
      data: {
        status: this.state.status,
        pot: this.state.pot,
        communityCards: JSON.stringify(this.state.communityCards),
        dealerPosition: this.state.dealerPosition,
        currentPlayerPosition: this.state.currentPlayerPosition
      }
    });
  }

  private broadcast(): void {
    console.log(`📤 [BROADCAST] Broadcasting game state to table ${this.tableId}`);
    console.log(`📤 [BROADCAST] State: status=${this.state.status}, pot=${this.state.pot}, players=${this.state.players.length}`);
    this.io.to(`table:${this.tableId}`).emit('game:state', {
      ...this.state,
      players: this.state.players.map(p => ({
        ...p,
        holeCards: p.userId === p.id ? p.holeCards : ['🃏', '🃏']
      }))
    });
    console.log(`✅ [BROADCAST] game:state emitted to room table:${this.tableId}`);
  }

  getState(): GameState {
    return this.state;
  }
}
