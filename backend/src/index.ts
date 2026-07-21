import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import crypto from 'crypto';

export const prisma = new PrismaClient();
export const redis = new Redis('redis://localhost:6379');

const app = express();

// Custom CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Table configurations with different buy-ins
const TABLE_CONFIGS = [
  { name: 'Micro Stakes', stakes: 50, buyIn: 500, maxPlayers: 9 },
  { name: 'Small Stakes', stakes: 100, buyIn: 1000, maxPlayers: 9 },
  { name: 'Medium Stakes', stakes: 200, buyIn: 2000, maxPlayers: 9 },
  { name: 'High Stakes', stakes: 500, buyIn: 5000, maxPlayers: 9 },
  { name: 'Pro Stakes', stakes: 1000, buyIn: 10000, maxPlayers: 9 },
];

// Function to create a new table with seats
async function createAutoTable(stakesOverride?: number) {
  // Find which config to use
  let config;
  if (stakesOverride) {
    config = TABLE_CONFIGS.find(c => c.stakes === stakesOverride);
  }
  
  if (!config) {
    // Get the least populated stake level
    const tableCounts = await prisma.pokerTable.groupBy({
      by: ['stakes'],
      _count: true
    });
    
    // Find the stake level with the fewest tables
    let minCount = Infinity;
    let minStakes = TABLE_CONFIGS[0].stakes;
    
    for (const c of TABLE_CONFIGS) {
      const count = tableCounts.find(t => t.stakes === c.stakes)?._count || 0;
      if (count < minCount) {
        minCount = count;
        minStakes = c.stakes;
      }
    }
    
    config = TABLE_CONFIGS.find(c => c.stakes === minStakes);
  }
  
  if (!config) config = TABLE_CONFIGS[0];
  
  const tableCount = await prisma.pokerTable.count({
    where: { stakes: config.stakes }
  });
  const tableNumber = tableCount + 1;
  
  const table = await prisma.$transaction(async (tx) => {
    const newTable = await tx.pokerTable.create({
      data: {
        name: `${config.name} Table ${tableNumber}`,
        stakes: config.stakes,
        buyIn: config.buyIn,
        maxPlayers: config.maxPlayers,
        status: 'waiting'
      }
    });
    
    const seatData = [];
    for (let i = 0; i < config.maxPlayers; i++) {
      seatData.push({
        tableId: newTable.id,
        position: i,
        stack: 0,
        isSitting: false
      });
    }
    
    await tx.seat.createMany({
      data: seatData
    });
    
    return await tx.pokerTable.findUnique({
      where: { id: newTable.id },
      include: { seats: true }
    });
  });
  
  console.log(`🆕 Auto-created table: ${table.name} (₹${config.buyIn} buy-in)`);
  return table;
}

// Initialize tables on startup - create one of each stake level
async function initializeTables() {
  const count = await prisma.pokerTable.count();
  if (count === 0) {
    console.log('📋 No tables found. Creating initial tables...');
    for (const config of TABLE_CONFIGS) {
      await createAutoTable(config.stakes);
    }
  }
}

initializeTables().catch(console.error);

app.get('/api/health', (req, res) => {
  res.json({ status: 'Poker Engine Skeleton Running', timestamp: new Date().toISOString() });
});

// Get all table configurations
app.get('/api/table/configs', (req, res) => {
  res.json(TABLE_CONFIGS);
});

// ============ WALLET ENDPOINT ============
app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await prisma.wallet.findUnique({
      where: { userId }
    });
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json({ balance: wallet.balance, locked: wallet.locked });
  } catch (error) {
    console.error('Wallet error:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
});

// ============ AUTH ENDPOINTS ============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', { email });
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const bcrypt = await import('bcryptjs');
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = crypto.randomBytes(32).toString('hex');
    await redis.setex(`session:${token}`, 604800, user.id);
    await prisma.session.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ User logged in:', user.email);
    res.json({ 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      wallet: user.wallet,
      token: token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: String(error) });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    console.log('Register attempt:', { email, name });
    
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });
    
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        password: hashed,
        wallet: { create: { balance: 10000 } } // Starting balance ₹10,000
      },
      include: { wallet: true }
    });
    
    const token = crypto.randomBytes(32).toString('hex');
    await redis.setex(`session:${token}`, 604800, user.id);
    await prisma.session.create({
      data: {
        userId: user.id,
        token: token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    console.log('✅ User registered:', user.id);
    res.status(201).json({ 
      id: user.id, 
      email: user.email, 
      name: user.name, 
      wallet: user.wallet,
      token: token
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create user', details: String(error) });
  }
});

// ============ TABLE ENDPOINTS ============
app.post('/api/table/join', async (req, res) => {
  try {
    const { userId, stakes } = req.body;
    console.log('Join table attempt for user:', userId, 'stakes:', stakes);
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    let wallet = user.wallet;
    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: userId,
          balance: 10000
        }
      });
    }
    
    // Find the config for this stake level
    const config = TABLE_CONFIGS.find(c => c.stakes === stakes);
    if (!config) {
      return res.status(400).json({ error: 'Invalid stake level' });
    }
    
    const buyIn = config.buyIn;
    
    if (wallet.balance < buyIn) {
      return res.status(400).json({ error: `Insufficient balance. Need ₹${buyIn} for this table.` });
    }
    
    // Check if user is already at a table
    const userAtTable = await prisma.seat.findFirst({
      where: {
        userId: userId,
        isSitting: true
      }
    });
    
    if (userAtTable) {
      return res.status(400).json({ error: 'You are already at a table! Leave first.' });
    }
    
    // Find table with available seat for this stake level
    const tables = await prisma.pokerTable.findMany({
      where: { stakes: stakes },
      include: {
        seats: {
          where: { isSitting: false }
        }
      }
    });
    
    let availableTable = null;
    let availableSeat = null;
    
    // Find first table with available seat
    for (const table of tables) {
      if (table.seats.length > 0) {
        availableTable = table;
        availableSeat = table.seats[0];
        break;
      }
    }
    
    // If no table has available seats, create a new one
    if (!availableTable || !availableSeat) {
      console.log(`📋 No available seats for ${config.name}. Creating new table...`);
      const newTable = await createAutoTable(stakes);
      
      const newSeats = await prisma.seat.findMany({
        where: {
          tableId: newTable.id,
          isSitting: false
        },
        take: 1
      });
      
      if (newSeats.length === 0) {
        return res.status(500).json({ error: 'Failed to create new table' });
      }
      
      availableTable = newTable;
      availableSeat = newSeats[0];
    }
    
    // Update the seat
    const seat = await prisma.seat.update({
      where: { id: availableSeat.id },
      data: {
        userId: userId,
        stack: buyIn,
        isSitting: true
      }
    });
    
    // Lock the buy-in amount
    await prisma.wallet.update({
      where: { userId: userId },
      data: {
        balance: wallet.balance - buyIn,
        locked: wallet.locked + buyIn
      }
    });
    
    // Check if table is now full
    const updatedTable = await prisma.pokerTable.findUnique({
      where: { id: availableTable.id },
      include: {
        seats: {
          where: { isSitting: true }
        }
      }
    });
    
    if (updatedTable.seats.length >= updatedTable.maxPlayers) {
      console.log(`🔄 Table ${updatedTable.name} is now full. Creating new table...`);
      await createAutoTable(stakes);
    }
    
    // Broadcast updated lobby
    const allTables = await prisma.pokerTable.findMany({
      include: { seats: { where: { isSitting: true } } }
    });
    io.emit('lobby:tables', allTables);
    io.emit('table:updated', updatedTable);
    
    console.log(`✅ User ${userId} joined ${availableTable.name} at position ${seat.position}`);
    res.status(201).json({ 
      seat, 
      position: seat.position, 
      table: availableTable.name,
      tableId: availableTable.id,
      buyIn: buyIn
    });
    
  } catch (error) {
    console.error('Join table error:', error);
    res.status(500).json({ error: 'Failed to join table', details: String(error) });
  }
});

// Get user's current table
app.get('/api/user/table/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const seat = await prisma.seat.findFirst({
      where: {
        userId: userId,
        isSitting: true
      },
      include: {
        table: {
          include: {
            seats: {
              where: { isSitting: true },
              include: { user: true }
            }
          }
        }
      }
    });
    
    if (!seat) {
      return res.json({ sitting: false });
    }
    
    res.json({
      sitting: true,
      table: seat.table,
      position: seat.position,
      stack: seat.stack
    });
  } catch (error) {
    console.error('Get user table error:', error);
    res.status(500).json({ error: 'Failed to get user table' });
  }
});

// Leave table
app.post('/api/table/leave', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const seat = await prisma.seat.findFirst({
      where: {
        userId: userId,
        isSitting: true
      }
    });
    
    if (!seat) {
      return res.status(404).json({ error: 'Not sitting at any table' });
    }
    
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
    }
    
    // Remove user from seat
    await prisma.seat.update({
      where: { id: seat.id },
      data: {
        userId: null,
        stack: 0,
        isSitting: false
      }
    });
    
    // Broadcast updated lobby
    const allTables = await prisma.pokerTable.findMany({
      include: { seats: { where: { isSitting: true } } }
    });
    io.emit('lobby:tables', allTables);
    
    res.json({ success: true, message: 'Left table successfully' });
  } catch (error) {
    console.error('Leave table error:', error);
    res.status(500).json({ error: 'Failed to leave table' });
  }
});

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('lobby:join', async () => {
    try {
      const tables = await prisma.pokerTable.findMany({
        include: { seats: { where: { isSitting: true } } }
      });
      socket.emit('lobby:tables', tables);
    } catch (error) {
      console.error('Lobby error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
  });
});

const PORT = 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend running on port ${PORT}`);
  console.log(`✅ Server listening on all network interfaces`);
});
