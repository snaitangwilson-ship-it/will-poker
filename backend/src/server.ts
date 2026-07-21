import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './database/client';
import { PokerGame } from './poker/PokerGame';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

console.log('🔧 Server starting...');

// ============ BLIND LEVELS ============
const BLIND_LEVELS = [
  { name: 'NLH ₹10/₹20', smallBlind: 10, bigBlind: 20, minBuyIn: 400, maxBuyIn: 2000 },
  { name: 'NLH ₹15/₹30', smallBlind: 15, bigBlind: 30, minBuyIn: 600, maxBuyIn: 3000 },
  { name: 'NLH ₹20/₹40', smallBlind: 20, bigBlind: 40, minBuyIn: 800, maxBuyIn: 4000 },
  { name: 'NLH ₹25/₹50', smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000 },
  { name: 'NLH ₹50/₹100', smallBlind: 50, bigBlind: 100, minBuyIn: 2000, maxBuyIn: 10000 },
  { name: 'NLH ₹100/₹200', smallBlind: 100, bigBlind: 200, minBuyIn: 4000, maxBuyIn: 20000 },
  { name: 'NLH ₹200/₹400', smallBlind: 200, bigBlind: 400, minBuyIn: 8000, maxBuyIn: 40000 },
  { name: 'NLH ₹500/₹1000', smallBlind: 500, bigBlind: 1000, minBuyIn: 20000, maxBuyIn: 100000 },
];

// ============ ACTIVE GAMES ============
const activeGames = new Map<string, PokerGame>();

// ============ BOT SYSTEM ============
const BOT_NAMES = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Epsilon', 'Bot Zeta', 'Bot Eta', 'Bot Theta'];
let botCounter = 0;

// ============ AUTO-CREATE TABLES ============
async function ensureTablesExist() {
  console.log('📋 Checking tables...');
  
  for (const level of BLIND_LEVELS) {
    const existing = await prisma.pokerTable.findFirst({
      where: { smallBlind: level.smallBlind, bigBlind: level.bigBlind }
    });
    
    if (!existing) {
      const table = await prisma.pokerTable.create({
        data: {
          name: `${level.name} Table 1`,
          gameType: 'NLH',
          smallBlind: level.smallBlind,
          bigBlind: level.bigBlind,
          minBuyIn: level.minBuyIn,
          maxBuyIn: level.maxBuyIn,
          maxPlayers: 9,
          status: 'waiting'
        }
      });
      
      for (let i = 0; i < 9; i++) {
        await prisma.seat.create({
          data: {
            tableId: table.id,
            position: i,
            stack: 0,
            isSitting: false
          }
        });
      }
      
      console.log(`✅ Created table: ${table.name}`);
    }
  }
  console.log('🎉 All tables initialized!');
}

// ============ AUTH ROUTES ============
app.post('/api/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        password: hashedPassword,
        wallet: { create: { balance: 10000 } }
      },
      include: { wallet: true }
    });
    
    const token = jwt.sign({ userId: user.id }, 'secret-key', { expiresIn: '7d' });
    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      wallet: user.wallet,
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ userId: user.id }, 'secret-key', { expiresIn: '7d' });
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      wallet: user.wallet,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============ API ROUTES ============
app.get('/api/blinds', (req, res) => res.json(BLIND_LEVELS));

app.get('/api/tables', async (req, res) => {
  try {
    const tables = await prisma.pokerTable.findMany({
      where: { status: { not: 'finished' } },
      include: {
        seats: {
          where: { isSitting: true },
          include: { user: true }
        },
        waitingList: {
          orderBy: { position: 'asc' },
          include: { user: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(tables);
  } catch (error) {
    console.error('Tables error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

app.get('/api/tables/:tableId', async (req, res) => {
  try {
    const table = await prisma.pokerTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        seats: {
          include: { user: true }
        },
        waitingList: {
          include: { user: true }
        }
      }
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    res.json(table);
  } catch (error) {
    console.error('Table error:', error);
    res.status(500).json({ error: 'Failed to fetch table' });
  }
});

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.params.userId }
    });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json({
      balance: wallet.balance,
      locked: wallet.locked,
      available: wallet.balance - wallet.locked
    });
  } catch (error) {
    console.error('Wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

app.get('/api/user/active-table/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const seat = await prisma.seat.findFirst({
      where: {
        userId: userId,
        isSitting: true
      },
      include: {
        table: true
      }
    });
    
    if (!seat) {
      return res.json({ hasActiveTable: false });
    }
    
    res.json({
      hasActiveTable: true,
      tableId: seat.tableId,
      table: seat.table,
      seat: seat
    });
  } catch (error) {
    console.error('Active table check error:', error);
    res.status(500).json({ error: 'Failed to check active table' });
  }
});

// ============ JOIN TABLE ============
app.post('/api/table/join', async (req, res) => {
  console.log('========================================');
  console.log('🎯 [JOIN] Request received');
  console.log(`🎯 [JOIN] Body: ${JSON.stringify(req.body)}`);
  console.log('========================================');
  
  try {
    const { userId, tableId, buyInAmount, seatPosition } = req.body;
    
    console.log(`🎯 [JOIN] User ${userId} joining table ${tableId} with buy-in ${buyInAmount}`);
    
    if (!userId || !tableId || !buyInAmount) {
      console.log('❌ [JOIN] Missing required fields');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingSeat = await prisma.seat.findFirst({
      where: { userId, isSitting: true }
    });
    if (existingSeat) {
      console.log(`❌ [JOIN] User already at table ${existingSeat.tableId}`);
      return res.status(400).json({ error: 'You are already at a table' });
    }

    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      include: { seats: true }
    });
    if (!table) {
      console.log(`❌ [JOIN] Table ${tableId} not found`);
      return res.status(404).json({ error: 'Table not found' });
    }
    console.log(`✅ [JOIN] Table found: ${table.name}`);

    if (buyInAmount < table.minBuyIn || buyInAmount > table.maxBuyIn) {
      console.log(`❌ [JOIN] Buy-in ${buyInAmount} outside range ${table.minBuyIn}-${table.maxBuyIn}`);
      return res.status(400).json({
        error: `Buy-in must be between ₹${table.minBuyIn} and ₹${table.maxBuyIn}`
      });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      console.log(`❌ [JOIN] Wallet not found for user ${userId}`);
      return res.status(400).json({ error: 'Wallet not found' });
    }
    console.log(`✅ [JOIN] Wallet balance: ${wallet.balance}`);
    
    if (wallet.balance < buyInAmount) {
      console.log(`❌ [JOIN] Insufficient balance: ${wallet.balance} < ${buyInAmount}`);
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    console.log(`🔍 [JOIN] Finding available seat...`);
    let targetSeat;
    if (seatPosition !== undefined) {
      targetSeat = table.seats.find(s => s.position === seatPosition && !s.isSitting);
    } else {
      targetSeat = table.seats.find(s => !s.isSitting);
    }
    
    if (!targetSeat) {
      console.log(`❌ [JOIN] No available seat at table ${tableId}`);
      return res.status(400).json({ error: 'No available seat' });
    }
    console.log(`✅ [JOIN] Found seat ${targetSeat.position}`);

    console.log(`💰 [JOIN] Deducting ${buyInAmount} from wallet...`);
    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: wallet.balance - buyInAmount,
        locked: wallet.locked + buyInAmount
      }
    });

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -buyInAmount,
        balance: wallet.balance - buyInAmount,
        type: 'BUY_IN',
        referenceId: tableId,
        description: `Buy-in at ${table.name}`
      }
    });

    console.log(`💺 [JOIN] Assigning seat ${targetSeat.position} to user ${userId}...`);
    const seat = await prisma.seat.update({
      where: { id: targetSeat.id },
      data: {
        userId,
        stack: buyInAmount,
        isSitting: true,
        reservedAt: null,
        reservedFor: null
      },
      include: { user: true }
    });

    await prisma.waitingList.deleteMany({
      where: { tableId, userId }
    });

    const seatedCount = await prisma.seat.count({
      where: { tableId, isSitting: true }
    });
    console.log(`👥 [JOIN] Now ${seatedCount} players seated at table ${tableId}`);

    if (seatedCount >= table.maxPlayers) {
      console.log(`🔴 [JOIN] Table ${tableId} is now full!`);
      await prisma.pokerTable.update({
        where: { id: tableId },
        data: { status: 'full' }
      });

      const level = BLIND_LEVELS.find(l =>
        l.smallBlind === table.smallBlind && l.bigBlind === table.bigBlind
      );
      if (level) {
        const count = await prisma.pokerTable.count({
          where: {
            smallBlind: table.smallBlind,
            bigBlind: table.bigBlind
          }
        });
        
        const newTable = await prisma.pokerTable.create({
          data: {
            name: `${level.name} Table ${count + 1}`,
            gameType: 'NLH',
            smallBlind: level.smallBlind,
            bigBlind: level.bigBlind,
            minBuyIn: level.minBuyIn,
            maxBuyIn: level.maxBuyIn,
            maxPlayers: 9,
            status: 'waiting'
          }
        });
        
        for (let i = 0; i < 9; i++) {
          await prisma.seat.create({
            data: {
              tableId: newTable.id,
              position: i,
              stack: 0,
              isSitting: false
            }
          });
        }
        console.log(`🆕 [JOIN] Auto-created new table: ${newTable.name}`);
      }
    }

    // ============ GAME CREATION ============
    if (seatedCount >= 2) {
      console.log(`🚀 [GAME] Checking if game already exists for table ${tableId}...`);
      
      const existingGame = await prisma.game.findFirst({
        where: {
          tableId: tableId,
          status: { not: 'finished' }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!existingGame) {
        console.log(`🚀 [GAME] No existing game found. Starting new game for table ${tableId} with ${seatedCount} players`);
        
        const gameId = `game_${tableId}_${Date.now()}`;
        console.log(`📝 [GAME] Creating game record with ID: ${gameId}`);
        
        await prisma.game.create({
          data: {
            id: gameId,
            tableId: tableId,
            status: 'waiting',
            smallBlind: table.smallBlind,
            bigBlind: table.bigBlind,
            dealerPosition: 0,
            currentPlayerPosition: 0
          }
        });

        console.log(`🔧 [GAME] Creating PokerGame instance...`);
        const game = new PokerGame(gameId, tableId, table.smallBlind, table.bigBlind, io);
        activeGames.set(gameId, game);
        console.log(`✅ [GAME] PokerGame instance created and stored in activeGames (${activeGames.size} total games)`);
        
        console.log(`🚀 [GAME] Initializing game...`);
        const gameState = await game.initGame();
        console.log(`✅ [GAME] Game initialized with status: ${gameState.status}`);
        console.log(`   Players: ${gameState.players.length}`);
        console.log(`   Pot: ${gameState.pot}`);
        
        console.log(`📤 [GAME] Broadcasting game:started to table ${tableId}...`);
        io.to(`table:${tableId}`).emit('game:started', { gameId });
        
        console.log(`📤 [GAME] Broadcasting game:state to table ${tableId}...`);
        io.to(`table:${tableId}`).emit('game:state', gameState);
        
        console.log(`✅ [GAME] Game state broadcast complete!`);
      } else {
        console.log(`✅ [GAME] Game already exists for table ${tableId}. Not starting a new one.`);
        const game = activeGames.get(existingGame.id);
        if (game) {
          const state = game.getState();
          io.to(`table:${tableId}`).emit('game:state', state);
          console.log(`📤 [GAME] Existing game state sent to table ${tableId}`);
        }
      }
    } else {
      console.log(`⏳ [GAME] Only ${seatedCount} player(s). Need 2 to start.`);
    }

    io.emit('table:updated', { tableId });

    const fullTable = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      include: {
        seats: {
          include: { user: true }
        },
        waitingList: {
          include: { user: true }
        }
      }
    });

    console.log(`✅ [JOIN] Join completed successfully for user ${userId}`);
    console.log('========================================');

    res.json({
      success: true,
      table: fullTable,
      seat: seat,
      message: `Joined table with ₹${buyInAmount} buy-in`
    });
  } catch (error) {
    console.error('❌ [JOIN] Error:', error);
    console.error('❌ [JOIN] Stack:', error.stack);
    res.status(500).json({ error: 'Failed to join table', details: String(error) });
  }
});

// ============ LEAVE ROUTE ============
app.post('/api/table/leave', async (req, res) => {
  try {
    const { userId, inHand } = req.body;
    const seat = await prisma.seat.findFirst({
      where: { userId, isSitting: true }
    });
    if (!seat) return res.status(404).json({ error: 'Not at any table' });

    if (!inHand) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (wallet) {
        await prisma.wallet.update({
          where: { userId },
          data: {
            balance: wallet.balance + seat.stack,
            locked: wallet.locked - seat.stack
          }
        });
        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: seat.stack,
            balance: wallet.balance + seat.stack,
            type: 'CASH_OUT',
            referenceId: seat.tableId,
            description: 'Left table'
          }
        });
      }

      await prisma.seat.update({
        where: { id: seat.id },
        data: {
          userId: null,
          stack: 0,
          isSitting: false,
          isSitOut: false,
          reservedAt: null,
          reservedFor: null
        }
      });

      const nextInLine = await prisma.waitingList.findFirst({
        where: { tableId: seat.tableId },
        orderBy: { position: 'asc' }
      });

      if (nextInLine) {
        io.emit('waiting:available', {
          tableId: seat.tableId,
          userId: nextInLine.userId
        });
      }

      io.emit('table:updated', { tableId: seat.tableId });
      res.json({ success: true, message: 'Left table successfully' });
    } else {
      await prisma.seat.update({
        where: { id: seat.id },
        data: { isSitOut: true }
      });
      res.json({ 
        success: true, 
        message: 'Will leave after current hand',
        leaveAfterHand: true
      });
    }
  } catch (error) {
    console.error('Leave table error:', error);
    res.status(500).json({ error: 'Failed to leave table' });
  }
});

app.post('/api/table/buy-more', async (req, res) => {
  try {
    const { userId, tableId, amount } = req.body;
    
    const seat = await prisma.seat.findFirst({
      where: { userId, tableId, isSitting: true }
    });
    if (!seat) return res.status(404).json({ error: 'Not at table' });

    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId }
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });

    if (amount < table.minBuyIn || amount > table.maxBuyIn) {
      return res.status(400).json({
        error: `Amount must be between ₹${table.minBuyIn} and ₹${table.maxBuyIn}`
      });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    await prisma.wallet.update({
      where: { userId },
      data: {
        balance: wallet.balance - amount,
        locked: wallet.locked + amount
      }
    });

    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: -amount,
        balance: wallet.balance - amount,
        type: 'REBUY',
        referenceId: tableId,
        description: `Rebuy at ${table.name}`
      }
    });

    const updatedSeat = await prisma.seat.update({
      where: { id: seat.id },
      data: {
        stack: seat.stack + amount
      }
    });

    io.to(`table:${tableId}`).emit('player:updated', {
      userId,
      stack: updatedSeat.stack
    });

    res.json({
      success: true,
      newStack: updatedSeat.stack,
      message: `Added ₹${amount} to your stack`
    });
  } catch (error) {
    console.error('Buy more error:', error);
    res.status(500).json({ error: 'Failed to add chips' });
  }
});

app.post('/api/table/sit-out', async (req, res) => {
  try {
    const { userId, tableId } = req.body;
    
    const seat = await prisma.seat.findFirst({
      where: {
        userId: userId,
        tableId: tableId,
        isSitting: true
      }
    });
    
    if (!seat) {
      return res.status(404).json({ error: 'Seat not found' });
    }
    
    await prisma.seat.update({
      where: { id: seat.id },
      data: { isSitOut: true }
    });
    
    io.to(`table:${tableId}`).emit('player:sitout', { userId });
    
    res.json({ success: true, message: 'Sitting out' });
  } catch (error) {
    console.error('Sit out error:', error);
    res.status(500).json({ error: 'Failed to sit out' });
  }
});

app.post('/api/table/waiting', async (req, res) => {
  try {
    const { tableId, userId } = req.body;
    
    const existing = await prisma.waitingList.findFirst({
      where: { tableId, userId }
    });
    
    if (existing) {
      return res.json({ success: true, message: 'Already on waiting list' });
    }
    
    const count = await prisma.waitingList.count({ where: { tableId } });
    
    await prisma.waitingList.create({
      data: {
        tableId,
        userId,
        position: count + 1
      }
    });
    
    res.json({ success: true, message: 'Added to waiting list' });
  } catch (error) {
    console.error('Waiting list error:', error);
    res.status(500).json({ error: 'Failed to join waiting list' });
  }
});

// ============ BOT ROUTES ============
app.post('/api/dev/add-bots', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Bot mode disabled in production' });
  }

  try {
    const { tableId, count = 1, buyInAmount } = req.body;
    
    console.log(`🤖 [BOTS] Adding ${count} bot(s) to table ${tableId}`);
    console.log(`🤖 [BOTS] Current active games: ${Array.from(activeGames.keys()).join(', ')}`);
    
    const table = await prisma.pokerTable.findUnique({
      where: { id: tableId },
      include: { seats: true }
    });
    
    if (!table) {
      console.log('❌ [BOTS] Table not found');
      return res.status(404).json({ error: 'Table not found' });
    }

    console.log(`📊 [BOTS] Table ${tableId} has ${table.seats.filter(s => s.isSitting).length} players already seated`);

    const botsAdded = [];
    const seatsAdded = [];

    for (let i = 0; i < count; i++) {
      const emptySeat = table.seats.find(s => !s.isSitting && s.userId === null);
      if (!emptySeat) {
        console.log(`🤖 [BOTS] No available seats for bot ${i}`);
        break;
      }

      const botName = BOT_NAMES[botCounter % BOT_NAMES.length];
      botCounter++;

      const botEmail = `bot_${Date.now()}_${botCounter}@poker.local`;
      console.log(`🤖 [BOTS] Creating bot user: ${botName} (${botEmail})`);
      
      const botUser = await prisma.user.create({
        data: {
          email: botEmail,
          name: botName,
          password: 'bot_password_123',
          wallet: { create: { balance: 10000 } }
        }
      });

      const buyIn = buyInAmount || table.minBuyIn;

      await prisma.wallet.update({
        where: { userId: botUser.id },
        data: {
          balance: 10000 - buyIn,
          locked: buyIn
        }
      });

      const seat = await prisma.seat.update({
        where: { id: emptySeat.id },
        data: {
          userId: botUser.id,
          stack: buyIn,
          isSitting: true,
          isSitOut: false
        }
      });

      botsAdded.push(botUser);
      seatsAdded.push(seat);
      
      console.log(`🤖 [BOTS] Added ${botName} to seat ${seat.position}`);
    }

    const seatedCount = await prisma.seat.count({
      where: { tableId, isSitting: true }
    });

    console.log(`👥 [BOTS] Now ${seatedCount} players seated at table ${tableId}`);
    console.log(`👥 [BOTS] seatedCount >= 2? ${seatedCount >= 2}`);

    // ============ GAME CREATION FOR BOTS ============
    if (seatedCount >= 2) {
      console.log(`🚀 [BOTS] Checking if game already exists for table ${tableId}...`);
      
      const existingGame = await prisma.game.findFirst({
        where: {
          tableId: tableId,
          status: { not: 'finished' }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (existingGame) {
        console.log(`✅ [BOTS] Game already exists: ${existingGame.id}`);
        // Send existing game state
        const game = activeGames.get(existingGame.id);
        if (game) {
          const state = game.getState();
          io.to(`table:${tableId}`).emit('game:state', state);
          console.log(`📤 [BOTS] Existing game state sent to table ${tableId}`);
        } else {
          console.log(`❌ [BOTS] Game ${existingGame.id} not in memory!`);
        }
      } else {
        console.log(`🚀 [BOTS] No existing game found. Starting new game for table ${tableId} with ${seatedCount} players`);
        
        const gameId = `game_${tableId}_${Date.now()}`;
        console.log(`📝 [BOTS] Creating game record with ID: ${gameId}`);
        
        await prisma.game.create({
          data: {
            id: gameId,
            tableId: tableId,
            status: 'waiting',
            smallBlind: table.smallBlind,
            bigBlind: table.bigBlind,
            dealerPosition: 0,
            currentPlayerPosition: 0
          }
        });

        console.log(`🔧 [BOTS] Creating PokerGame instance...`);
        const game = new PokerGame(gameId, tableId, table.smallBlind, table.bigBlind, io);
        activeGames.set(gameId, game);
        console.log(`✅ [BOTS] PokerGame instance created. Total active games: ${activeGames.size}`);
        
        console.log(`🚀 [BOTS] Calling game.initGame()...`);
        const gameState = await game.initGame();
        console.log(`✅ [BOTS] Game initialized with status: ${gameState.status}`);
        console.log(`   Players in game: ${gameState.players.length}`);
        console.log(`   Pot: ${gameState.pot}`);
        
        console.log(`📤 [BOTS] Broadcasting game:started to table ${tableId}...`);
        io.to(`table:${tableId}`).emit('game:started', { gameId });
        
        console.log(`📤 [BOTS] Broadcasting game:state to table ${tableId}...`);
        io.to(`table:${tableId}`).emit('game:state', gameState);
        console.log(`✅ [BOTS] Game state broadcast complete!`);
      }
    } else {
      console.log(`⏳ [BOTS] Only ${seatedCount} player(s). Need 2 to start.`);
    }

    io.emit('table:updated', { tableId });

    res.json({
      success: true,
      botsAdded: botsAdded.length,
      totalSeated: seatedCount,
      bots: botsAdded.map(b => ({ id: b.id, name: b.name })),
      seats: seatsAdded.map(s => ({ position: s.position, stack: s.stack }))
    });
  } catch (error) {
    console.error('❌ [BOTS] Error:', error);
    console.error('❌ [BOTS] Stack:', error.stack);
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/dev/clear-bots', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Bot mode disabled in production' });
  }

  try {
    const { tableId } = req.body;
    
    const seats = await prisma.seat.findMany({
      where: { 
        tableId, 
        isSitting: true 
      },
      include: { user: true }
    });

    for (const seat of seats) {
      if (seat.user?.email?.includes('@poker.local')) {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: seat.userId }
        });
        if (wallet) {
          await prisma.wallet.update({
            where: { userId: seat.userId },
            data: {
              balance: wallet.balance + seat.stack,
              locked: wallet.locked - seat.stack
            }
          });
        }

        await prisma.seat.update({
          where: { id: seat.id },
          data: {
            userId: null,
            stack: 0,
            isSitting: false
          }
        });

        if (seat.userId) {
          await prisma.user.delete({
            where: { id: seat.userId }
          });
        }
      }
    }

    io.emit('table:updated', { tableId });

    res.json({ success: true, message: 'Bots removed' });
  } catch (error) {
    console.error('❌ [BOTS] Clear error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// ============ DIAGNOSTIC ROUTE ============
app.get('/api/diagnostic/:tableId', async (req, res) => {
  try {
    const table = await prisma.pokerTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        seats: {
          include: { user: true }
        },
        games: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            players: true,
            actions: {
              orderBy: { timestamp: 'asc' },
              take: 20
            }
          }
        }
      }
    });
    
    res.json({
      table: {
        id: table.id,
        name: table.name,
        status: table.status,
        seatedPlayers: table.seats?.filter(s => s.isSitting).length || 0,
        maxPlayers: table.maxPlayers,
        seats: table.seats?.map(s => ({
          position: s.position,
          userId: s.userId,
          isSitting: s.isSitting,
          stack: s.stack,
          isSitOut: s.isSitOut
        }))
      },
      games: table.games?.map(g => ({
        id: g.id,
        status: g.status,
        pot: g.pot,
        players: g.players?.length || 0,
        createdAt: g.createdAt
      })),
      activeGamesInMemory: Array.from(activeGames.keys())
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`🟢 [SOCKET] Player connected: ${socket.id}`);

  socket.on('join:table', (tableId) => {
    socket.join(`table:${tableId}`);
    console.log(`✅ [SOCKET] Socket ${socket.id} joined room table:${tableId}`);
    console.log(`📊 [SOCKET] Rooms: ${Array.from(socket.rooms).join(', ')}`);
  });

  socket.on('leave:table', (tableId) => {
    socket.leave(`table:${tableId}`);
    console.log(`❌ [SOCKET] Socket ${socket.id} left room table:${tableId}`);
  });

  socket.on('request:game:state', (data) => {
    console.log(`📊 [SOCKET] Requesting game state for ${data.gameId}`);
    const game = activeGames.get(data.gameId);
    if (game) {
      const state = game.getState();
      socket.emit('game:state', state);
      console.log(`✅ [SOCKET] Game state sent to ${socket.id}`);
    } else {
      console.log(`❌ [SOCKET] Game ${data.gameId} not found in activeGames`);
      console.log(`📊 [SOCKET] Active games: ${Array.from(activeGames.keys()).join(', ')}`);
    }
  });

  socket.on('game:action', async (data) => {
    try {
      console.log(`🎮 [SOCKET] Action: ${data.action} by ${data.userId} on ${data.gameId}`);
      const { gameId, userId, action, amount } = data;
      const game = activeGames.get(gameId);
      if (game) {
        const result = await game.processAction(userId, action, amount);
        io.to(`table:${gameId}`).emit('game:state', result);
        console.log(`✅ [SOCKET] Action processed and state broadcast`);
      } else {
        console.log(`❌ [SOCKET] Game ${gameId} not found`);
      }
    } catch (error) {
      console.error('❌ [SOCKET] Game action error:', error);
      socket.emit('game:error', { message: String(error) });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔴 [SOCKET] Player disconnected: ${socket.id}`);
  });
});

// ============ START SERVER ============
ensureTablesExist().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`✅ WebSocket server ready`);
  });
});

export { server, io };

// ============ DEVELOPMENT RESET ENDPOINTS ============

// Reset player state - removes player from any active table
app.post('/api/dev/reset-player', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Reset mode disabled in production' });
  }

  try {
    const { userId } = req.body;
    console.log(`🔧 [DEV] Resetting player ${userId}`);
    
    // Find if player is at any table
    const seat = await prisma.seat.findFirst({
      where: { userId, isSitting: true },
      include: { table: true }
    });

    if (!seat) {
      console.log(`🔧 [DEV] Player ${userId} is not at any table`);
      return res.json({ success: true, message: 'Player not at any table' });
    }

    console.log(`🔧 [DEV] Found player at table ${seat.tableId} seat ${seat.position}`);

    // Return chips to wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });

    if (wallet) {
      await prisma.wallet.update({
        where: { userId },
        data: {
          balance: wallet.balance + seat.stack,
          locked: wallet.locked - seat.stack
        }
      });
      
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: seat.stack,
          balance: wallet.balance + seat.stack,
          type: 'CASH_OUT',
          referenceId: seat.tableId,
          description: 'Dev reset - left table'
        }
      });
      
      console.log(`🔧 [DEV] Returned ${seat.stack} chips to wallet`);
    }

    // Remove from seat
    await prisma.seat.update({
      where: { id: seat.id },
      data: {
        userId: null,
        stack: 0,
        isSitting: false,
        isSitOut: false,
        reservedAt: null,
        reservedFor: null
      }
    });

    console.log(`🔧 [DEV] Player removed from seat`);

    // Check if any games need to be cleaned up
    const game = await prisma.game.findFirst({
      where: {
        tableId: seat.tableId,
        status: { not: 'finished' }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (game) {
      console.log(`🔧 [DEV] Active game found: ${game.id}`);
      // Remove from memory if exists
      if (activeGames.has(game.id)) {
        activeGames.delete(game.id);
        console.log(`🔧 [DEV] Removed game from memory`);
      }
    }

    io.emit('table:updated', { tableId: seat.tableId });

    console.log(`✅ [DEV] Player ${userId} reset successfully`);
    res.json({
      success: true,
      message: 'Player reset successfully',
      tableId: seat.tableId
    });
  } catch (error) {
    console.error('❌ [DEV] Reset error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Reset entire table - removes all players and bots
app.post('/api/dev/reset-table', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Reset mode disabled in production' });
  }

  try {
    const { tableId } = req.body;
    console.log(`🔧 [DEV] Resetting table ${tableId}`);
    
    // Get all occupied seats
    const seats = await prisma.seat.findMany({
      where: { tableId, isSitting: true },
      include: { user: true }
    });

    console.log(`🔧 [DEV] Found ${seats.length} occupied seats`);

    for (const seat of seats) {
      if (seat.userId) {
        // Return chips to wallet
        const wallet = await prisma.wallet.findUnique({
          where: { userId: seat.userId }
        });

        if (wallet) {
          await prisma.wallet.update({
            where: { userId: seat.userId },
            data: {
              balance: wallet.balance + seat.stack,
              locked: wallet.locked - seat.stack
            }
          });
        }

        // Remove from seat
        await prisma.seat.update({
          where: { id: seat.id },
          data: {
            userId: null,
            stack: 0,
            isSitting: false,
            isSitOut: false,
            reservedAt: null,
            reservedFor: null
          }
        });

        // If bot, delete user
        if (seat.user?.email?.includes('@poker.local')) {
          await prisma.user.delete({
            where: { id: seat.userId }
          });
          console.log(`🔧 [DEV] Deleted bot user: ${seat.user.email}`);
        }
      }
    }

    // End any active games
    const game = await prisma.game.findFirst({
      where: {
        tableId: tableId,
        status: { not: 'finished' }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (game) {
      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'finished', finishedAt: new Date() }
      });
      
      if (activeGames.has(game.id)) {
        activeGames.delete(game.id);
      }
      console.log(`🔧 [DEV] Ended game: ${game.id}`);
    }

    // Reset table status
    await prisma.pokerTable.update({
      where: { id: tableId },
      data: { status: 'waiting' }
    });

    io.emit('table:updated', { tableId });

    console.log(`✅ [DEV] Table ${tableId} reset successfully`);
    res.json({
      success: true,
      message: 'Table reset successfully'
    });
  } catch (error) {
    console.error('❌ [DEV] Reset table error:', error);
    res.status(500).json({ error: String(error) });
  }
});

// Get player status - check if player is at a table
app.get('/api/dev/player-status/:userId', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Dev mode disabled in production' });
  }

  try {
    const { userId } = req.params;
    
    const seat = await prisma.seat.findFirst({
      where: { userId, isSitting: true },
      include: { table: true }
    });

    if (!seat) {
      return res.json({
        isSeated: false,
        message: 'Player is not at any table'
      });
    }

    res.json({
      isSeated: true,
      tableId: seat.tableId,
      tableName: seat.table.name,
      position: seat.position,
      stack: seat.stack
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});
