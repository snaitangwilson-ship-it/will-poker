"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.io = exports.server = void 0;
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("./database/client");
const PokerGame_1 = require("./poker/PokerGame");
const ReconnectManager_1 = require("./services/ReconnectManager");
const ActionQueue_1 = require("./services/ActionQueue");
const SitOutManager_1 = require("./services/SitOutManager");
const Logger_1 = require("./services/Logger");
const security_1 = require("./lib/security");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
app.use((0, cors_1.default)({ origin: '*', credentials: true }));
app.use(express_1.default.json());
const server = http_1.default.createServer(app);
exports.server = server;
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        credentials: true,
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});
exports.io = io;
console.log('🔧 Server starting...');
// ============ GLOBAL INSTANCES ============
const reconnectManager = ReconnectManager_1.ReconnectManager.getInstance();
const actionQueue = new ActionQueue_1.ActionQueue();
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
const activeGames = new Map();
// ============ BOT SYSTEM ============
const BOT_NAMES = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Epsilon', 'Bot Zeta', 'Bot Eta', 'Bot Theta'];
let botCounter = 0;
// ============ AUTO-CREATE TABLES ============
async function ensureTablesExist() {
    console.log('📋 Checking tables...');
    for (const level of BLIND_LEVELS) {
        const existing = await client_1.prisma.pokerTable.findFirst({
            where: { smallBlind: level.smallBlind, bigBlind: level.bigBlind }
        });
        if (!existing) {
            const table = await client_1.prisma.pokerTable.create({
                data: {
                    name: `${level.name} Table 1`,
                    gameType: 'NLH',
                    smallBlind: level.smallBlind,
                    bigBlind: level.bigBlind,
                    minBuyIn: level.minBuyIn,
                    maxBuyIn: level.maxBuyIn,
                    maxPlayers: 9,
                    status: 'waiting',
                    dealerPosition: 0
                }
            });
            for (let i = 0; i < 9; i++) {
                await client_1.prisma.seat.create({
                    data: { tableId: table.id, position: i, stack: 0, isSitting: false }
                });
            }
            console.log(`✅ Created table: ${table.name}`);
        }
    }
    console.log('🎉 All tables initialized!');
}
// ============ STARTUP RECOVERY ============
async function recoverOrphanedGames() {
    console.log('[RECOVERY] Checking for orphaned games...');
    const tables = await client_1.prisma.pokerTable.findMany({
        where: {
            status: 'playing',
            currentGameId: { not: null }
        }
    });
    for (const table of tables) {
        const gameInMemory = activeGames.has(table.currentGameId);
        if (!gameInMemory) {
            console.log(`[RECOVERY] Found orphaned game for table ${table.id} (${table.name}), gameId: ${table.currentGameId}`);
            await client_1.prisma.pokerTable.update({
                where: { id: table.id },
                data: { status: 'waiting', currentGameId: null }
            });
            await client_1.prisma.game.updateMany({
                where: { id: table.currentGameId },
                data: { status: 'finished', finishedAt: new Date() }
            });
            console.log(`[RECOVERY] Reset orphaned game for table ${table.id}`);
        }
    }
    console.log('[RECOVERY] Orphaned game recovery complete.');
}
// ============ SERVER RESTART RECOVERY ============
async function recoverGames() {
    console.log('[RECOVER] Checking for games to restore...');
    const pendingGames = await client_1.prisma.game.findMany({
        where: { status: { not: 'finished' } }
    });
    for (const game of pendingGames) {
        const state = await client_1.prisma.gameState.findUnique({ where: { gameId: game.id } });
        if (state) {
            const pokerGame = new PokerGame_1.PokerGame(game.id, game.tableId, game.smallBlind, game.bigBlind, io);
            pokerGame.restoreState(state.state);
            activeGames.set(game.id, pokerGame);
            console.log(`[RECOVER] Restored game ${game.id}`);
        }
        else {
            await client_1.prisma.game.update({
                where: { id: game.id },
                data: { status: 'finished', finishedAt: new Date() }
            });
            console.log(`[RECOVER] Closed unfinished game ${game.id} (no saved state)`);
        }
    }
    console.log('[RECOVER] Recovery complete.');
}
// ============ DISPOSE GAME ============
async function disposeGame(tableId) {
    let gameToRemove = null;
    let gameIdToRemove = null;
    for (const [id, game] of activeGames) {
        if (game.getState().tableId === tableId) {
            gameToRemove = game;
            gameIdToRemove = id;
            break;
        }
    }
    if (gameToRemove && gameIdToRemove) {
        gameToRemove.dispose();
        activeGames.delete(gameIdToRemove);
        console.log(`[DISPOSE] Removed game ${gameIdToRemove} for table ${tableId}`);
    }
}
// ============ SHARED GAME-START FUNCTION ============
async function startGameIfReady(tableId) {
    console.log(`[GAME] 🔍 startGameIfReady called for table ${tableId}`);
    const seatedCount = await client_1.prisma.seat.count({
        where: { tableId, isSitting: true }
    });
    console.log(`[GAME] 👥 Seated players: ${seatedCount}`);
    if (seatedCount < 2) {
        console.log(`[GAME] ⏳ Not enough players (${seatedCount}/2). Waiting.`);
        return;
    }
    const existingGame = await client_1.prisma.game.findFirst({
        where: {
            tableId: tableId,
            status: { not: 'finished' }
        },
        orderBy: { createdAt: 'desc' }
    });
    if (existingGame) {
        const gameInMemory = activeGames.has(existingGame.id);
        if (!gameInMemory) {
            console.log(`[GAME] ⚠️ Game exists in DB but not in memory. Resetting orphaned game.`);
            await client_1.prisma.pokerTable.update({
                where: { id: tableId },
                data: {
                    status: 'waiting',
                    currentGameId: null
                }
            });
            await client_1.prisma.game.update({
                where: { id: existingGame.id },
                data: { status: 'finished', finishedAt: new Date() }
            });
            console.log(`[GAME] Orphaned game reset. Proceeding to create a new game.`);
        }
        else {
            console.log(`[GAME] 🟢 Game already exists (${existingGame.id}) and is in memory.`);
            const game = activeGames.get(existingGame.id);
            if (game) {
                const state = game.getState();
                io.to(`table:${tableId}`).emit('game:state', state);
                console.log(`[GAME] 📤 Existing game state sent.`);
            }
            return;
        }
    }
    console.log(`[GAME] 🚀 Starting new game for table ${tableId} with ${seatedCount} players`);
    const table = await client_1.prisma.pokerTable.findUnique({
        where: { id: tableId },
        include: { seats: { where: { isSitting: true } } }
    });
    if (!table) {
        console.log(`[GAME] ❌ Table ${tableId} not found.`);
        return;
    }
    const gameId = `game_${tableId}_${Date.now()}`;
    console.log(`[GAME] 📝 Creating game record: ${gameId}`);
    await client_1.prisma.game.create({
        data: {
            id: gameId,
            tableId: tableId,
            status: 'waiting',
            smallBlind: table.smallBlind,
            bigBlind: table.bigBlind,
            dealerPosition: table.dealerPosition || 0,
            currentPlayerPosition: 0
        }
    });
    await client_1.prisma.pokerTable.update({
        where: { id: tableId },
        data: {
            status: 'playing',
            currentGameId: gameId
        }
    });
    console.log(`[GAME] ✅ Table status updated to 'playing'`);
    console.log(`[GAME] 🔧 Creating PokerGame instance...`);
    const game = new PokerGame_1.PokerGame(gameId, tableId, table.smallBlind, table.bigBlind, io);
    activeGames.set(gameId, game);
    console.log(`[GAME] ✅ PokerGame instance created.`);
    console.log(`[GAME] 🃏 Initializing PokerGame...`);
    const gameState = await game.initGame();
    console.log(`[GAME] ✅ Game initialized. Status: ${gameState.status}, Players: ${gameState.players.length}`);
    console.log(`[GAME] 📤 Emitting game:started to table ${tableId}`);
    io.to(`table:${tableId}`).emit('game:started', { gameId });
    console.log(`[GAME] 📤 Emitting game:state to table ${tableId}`);
    io.to(`table:${tableId}`).emit('game:state', gameState);
    console.log(`[GAME] 🎉 Game started successfully!`);
}
// ============ AUTH ROUTES ============
app.post('/api/register', async (req, res) => {
    try {
        const { email, name, password } = req.body;
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        const existing = await client_1.prisma.user.findUnique({ where: { email } });
        if (existing)
            return res.status(400).json({ error: 'Email already registered' });
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await client_1.prisma.user.create({
            data: {
                email,
                name: name || email.split('@')[0],
                password: hashedPassword,
                wallet: { create: { balance: 10000 } }
            },
            include: { wallet: true }
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, 'secret-key', { expiresIn: '7d' });
        res.status(201).json({
            id: user.id,
            email: user.email,
            name: user.name,
            wallet: user.wallet,
            token
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Register error:', errMsg);
        res.status(500).json({ error: 'Registration failed', details: errMsg });
    }
});
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await client_1.prisma.user.findUnique({
            where: { email },
            include: { wallet: true }
        });
        if (!user)
            return res.status(401).json({ error: 'Invalid credentials' });
        const valid = await bcryptjs_1.default.compare(password, user.password);
        if (!valid)
            return res.status(401).json({ error: 'Invalid credentials' });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, 'secret-key', { expiresIn: '7d' });
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            wallet: user.wallet,
            token
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Login error:', errMsg);
        res.status(500).json({ error: 'Login failed', details: errMsg });
    }
});
// ============ API ROUTES ============
app.get('/api/blinds', (req, res) => res.json(BLIND_LEVELS));
app.get('/api/tables', async (req, res) => {
    try {
        const tables = await client_1.prisma.pokerTable.findMany({
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
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Tables error:', errMsg);
        res.status(500).json({ error: 'Failed to fetch tables' });
    }
});
app.get('/api/tables/:tableId', async (req, res) => {
    try {
        const table = await client_1.prisma.pokerTable.findUnique({
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
        if (!table)
            return res.status(404).json({ error: 'Table not found' });
        res.json(table);
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Table error:', errMsg);
        res.status(500).json({ error: 'Failed to fetch table' });
    }
});
app.get('/api/wallet/:userId', async (req, res) => {
    try {
        const wallet = await client_1.prisma.wallet.findUnique({
            where: { userId: req.params.userId }
        });
        if (!wallet)
            return res.status(404).json({ error: 'Wallet not found' });
        res.json({
            balance: wallet.balance,
            locked: wallet.locked,
            available: wallet.balance - wallet.locked
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Wallet error:', errMsg);
        res.status(500).json({ error: 'Failed to get wallet' });
    }
});
app.get('/api/user/active-table/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        const seat = await client_1.prisma.seat.findFirst({
            where: { userId, isSitting: true },
            include: { table: true }
        });
        if (!seat)
            return res.json({ hasActiveTable: false });
        res.json({
            hasActiveTable: true,
            tableId: seat.tableId,
            table: seat.table,
            seat: seat
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Active table check error:', errMsg);
        res.status(500).json({ error: 'Failed to check active table' });
    }
});
// ============ JOIN TABLE (with wallet creation) ============
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
        const user = await client_1.prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            console.log(`❌ [JOIN] User ${userId} not found`);
            return res.status(404).json({ error: 'User not found' });
        }
        let wallet = await client_1.prisma.wallet.findUnique({
            where: { userId: userId }
        });
        if (!wallet) {
            console.log(`💰 [JOIN] No wallet found for user ${userId}, creating one...`);
            wallet = await client_1.prisma.wallet.create({
                data: {
                    userId: userId,
                    balance: 10000,
                    locked: 0
                }
            });
        }
        const existingSeat = await client_1.prisma.seat.findFirst({
            where: { userId, isSitting: true }
        });
        if (existingSeat) {
            console.log(`❌ [JOIN] User already at table ${existingSeat.tableId}`);
            return res.status(400).json({ error: 'You are already at a table' });
        }
        const table = await client_1.prisma.pokerTable.findUnique({
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
        if (wallet.balance < buyInAmount) {
            console.log(`❌ [JOIN] Insufficient balance: ${wallet.balance} < ${buyInAmount}`);
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        console.log(`🔍 [JOIN] Finding available seat...`);
        let targetSeat;
        if (seatPosition !== undefined) {
            targetSeat = table.seats.find(s => s.position === seatPosition && !s.isSitting);
        }
        else {
            targetSeat = table.seats.find(s => !s.isSitting);
        }
        if (!targetSeat) {
            console.log(`❌ [JOIN] No available seat at table ${tableId}`);
            return res.status(400).json({ error: 'No available seat' });
        }
        console.log(`✅ [JOIN] Found seat ${targetSeat.position}`);
        console.log(`💰 [JOIN] Deducting ${buyInAmount} from wallet...`);
        await client_1.prisma.wallet.update({
            where: { userId },
            data: {
                balance: wallet.balance - buyInAmount,
                locked: wallet.locked + buyInAmount
            }
        });
        await client_1.prisma.walletTransaction.create({
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
        const seat = await client_1.prisma.seat.update({
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
        await client_1.prisma.waitingList.deleteMany({
            where: { tableId, userId }
        });
        const seatedCount = await client_1.prisma.seat.count({
            where: { tableId, isSitting: true }
        });
        console.log(`👥 [JOIN] Now ${seatedCount} players seated at table ${tableId}`);
        if (seatedCount === 0) {
            await disposeGame(tableId);
        }
        if (seatedCount >= table.maxPlayers) {
            console.log(`🔴 [JOIN] Table ${tableId} is now full!`);
            await client_1.prisma.pokerTable.update({
                where: { id: tableId },
                data: { status: 'full' }
            });
            const level = BLIND_LEVELS.find(l => l.smallBlind === table.smallBlind && l.bigBlind === table.bigBlind);
            if (level) {
                const count = await client_1.prisma.pokerTable.count({
                    where: {
                        smallBlind: table.smallBlind,
                        bigBlind: table.bigBlind
                    }
                });
                const newTable = await client_1.prisma.pokerTable.create({
                    data: {
                        name: `${level.name} Table ${count + 1}`,
                        gameType: 'NLH',
                        smallBlind: level.smallBlind,
                        bigBlind: level.bigBlind,
                        minBuyIn: level.minBuyIn,
                        maxBuyIn: level.maxBuyIn,
                        maxPlayers: 9,
                        status: 'waiting',
                        dealerPosition: 0
                    }
                });
                for (let i = 0; i < 9; i++) {
                    await client_1.prisma.seat.create({
                        data: { tableId: newTable.id, position: i, stack: 0, isSitting: false }
                    });
                }
                console.log(`🆕 [JOIN] Auto-created new table: ${newTable.name}`);
            }
        }
        await startGameIfReady(tableId);
        io.emit('table:updated', { tableId });
        const fullTable = await client_1.prisma.pokerTable.findUnique({
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
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [JOIN] Error:', errMsg);
        console.error('❌ [JOIN] Stack:', error instanceof Error ? error.stack : '');
        res.status(500).json({ error: 'Failed to join table', details: errMsg });
    }
});
// ============ LEAVE TABLE ============
app.post('/api/table/leave', async (req, res) => {
    try {
        const { userId, inHand } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        const seat = await client_1.prisma.seat.findFirst({
            where: { userId, isSitting: true }
        });
        if (!seat)
            return res.status(404).json({ error: 'Not at any table' });
        if (!inHand) {
            const wallet = await client_1.prisma.wallet.findUnique({ where: { userId } });
            if (wallet) {
                await client_1.prisma.wallet.update({
                    where: { userId },
                    data: {
                        balance: wallet.balance + seat.stack,
                        locked: wallet.locked - seat.stack
                    }
                });
                await client_1.prisma.walletTransaction.create({
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
            await client_1.prisma.seat.update({
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
            const seatedCount = await client_1.prisma.seat.count({
                where: { tableId: seat.tableId, isSitting: true }
            });
            if (seatedCount < 2) {
                await disposeGame(seat.tableId);
                await client_1.prisma.pokerTable.update({
                    where: { id: seat.tableId },
                    data: { status: 'waiting' }
                });
            }
            const nextInLine = await client_1.prisma.waitingList.findFirst({
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
        }
        else {
            await client_1.prisma.seat.update({
                where: { id: seat.id },
                data: { isSitOut: true }
            });
            res.json({
                success: true,
                message: 'Will leave after current hand',
                leaveAfterHand: true
            });
        }
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Leave table error:', errMsg);
        res.status(500).json({ error: 'Failed to leave table' });
    }
});
// ============ BUY MORE ============
app.post('/api/table/buy-more', async (req, res) => {
    try {
        const { userId, tableId, amount } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        const table = await client_1.prisma.pokerTable.findUnique({ where: { id: tableId } });
        if (!table)
            return res.status(404).json({ error: 'Table not found' });
        if (amount < table.minBuyIn || amount > table.maxBuyIn) {
            return res.status(400).json({ error: `Amount must be between ₹${table.minBuyIn} and ₹${table.maxBuyIn}` });
        }
        const wallet = await client_1.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        const seat = await client_1.prisma.seat.findFirst({ where: { userId, tableId, isSitting: true } });
        if (!seat)
            return res.status(404).json({ error: 'Not at table' });
        await client_1.prisma.$transaction([
            client_1.prisma.wallet.update({
                where: { userId },
                data: { balance: { decrement: amount }, locked: { increment: amount } }
            }),
            client_1.prisma.seat.update({
                where: { id: seat.id },
                data: { stack: { increment: amount } }
            }),
            client_1.prisma.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    amount: -amount,
                    balance: wallet.balance - amount,
                    type: 'REBUY',
                    referenceId: tableId,
                    description: `Rebuy at ${table.name}`
                }
            })
        ]);
        res.json({ success: true, newStack: seat.stack + amount });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Buy more error:', errMsg);
        res.status(500).json({ error: 'Failed to add chips' });
    }
});
// ============ SIT OUT ============
app.post('/api/table/sit-out', async (req, res) => {
    try {
        const { userId, tableId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        await SitOutManager_1.SitOutManager.sitOut(userId, tableId);
        res.json({ success: true });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Sit out error:', errMsg);
        res.status(500).json({ error: 'Failed to sit out' });
    }
});
app.post('/api/table/back', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        await SitOutManager_1.SitOutManager.returnToGame(userId);
        res.json({ success: true });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Sit out return error:', errMsg);
        res.status(500).json({ error: 'Failed to return to game' });
    }
});
// ============ WAITING LIST ============
app.post('/api/table/waiting', async (req, res) => {
    try {
        const { tableId, userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        const existing = await client_1.prisma.waitingList.findFirst({
            where: { tableId, userId }
        });
        if (existing) {
            return res.json({ success: true, message: 'Already on waiting list' });
        }
        const count = await client_1.prisma.waitingList.count({ where: { tableId } });
        await client_1.prisma.waitingList.create({
            data: {
                tableId,
                userId,
                position: count + 1
            }
        });
        res.json({ success: true, message: 'Added to waiting list' });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Waiting list error:', errMsg);
        res.status(500).json({ error: 'Failed to join waiting list' });
    }
});
// ============ BOT ROUTE ============
app.post('/api/dev/add-bots', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Bot mode disabled in production' });
    }
    try {
        const { tableId, count = 1, buyInAmount } = req.body;
        console.log(`🤖 [BOTS] Adding ${count} bot(s) to table ${tableId}`);
        const table = await client_1.prisma.pokerTable.findUnique({
            where: { id: tableId },
            include: { seats: true }
        });
        if (!table) {
            console.log('❌ [BOTS] Table not found');
            return res.status(404).json({ error: 'Table not found' });
        }
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
            const botUser = await client_1.prisma.user.create({
                data: {
                    email: botEmail,
                    name: botName,
                    password: 'bot_password_123',
                    wallet: { create: { balance: 10000 } }
                }
            });
            const buyIn = buyInAmount || table.minBuyIn;
            await client_1.prisma.wallet.update({
                where: { userId: botUser.id },
                data: {
                    balance: 10000 - buyIn,
                    locked: buyIn
                }
            });
            const seat = await client_1.prisma.seat.update({
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
        console.log(`🤖 [BOTS] About to call startGameIfReady for table ${tableId}`);
        await startGameIfReady(tableId);
        console.log(`🤖 [BOTS] startGameIfReady completed.`);
        io.emit('table:updated', { tableId });
        const seatedCount = await client_1.prisma.seat.count({
            where: { tableId, isSitting: true }
        });
        res.json({
            success: true,
            botsAdded: botsAdded.length,
            totalSeated: seatedCount,
            bots: botsAdded.map(b => ({ id: b.id, name: b.name })),
            seats: seatsAdded.map(s => ({ position: s.position, stack: s.stack }))
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [BOTS] Error:', errMsg);
        res.status(500).json({ error: String(error) });
    }
});
// ============ CLEAR BOTS ============
app.post('/api/dev/clear-bots', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Bot mode disabled in production' });
    }
    try {
        const { tableId } = req.body;
        const seats = await client_1.prisma.seat.findMany({
            where: { tableId, isSitting: true },
            include: { user: true }
        });
        for (const seat of seats) {
            if (seat.user?.email?.includes('@poker.local')) {
                const wallet = await client_1.prisma.wallet.findUnique({
                    where: { userId: seat.userId }
                });
                if (wallet) {
                    await client_1.prisma.wallet.update({
                        where: { userId: seat.userId },
                        data: {
                            balance: wallet.balance + seat.stack,
                            locked: wallet.locked - seat.stack
                        }
                    });
                }
                await client_1.prisma.seat.update({
                    where: { id: seat.id },
                    data: {
                        userId: null,
                        stack: 0,
                        isSitting: false
                    }
                });
                if (seat.userId) {
                    await client_1.prisma.user.delete({
                        where: { id: seat.userId }
                    });
                }
            }
        }
        const seatedCount = await client_1.prisma.seat.count({
            where: { tableId, isSitting: true }
        });
        if (seatedCount < 2) {
            await disposeGame(tableId);
            await client_1.prisma.pokerTable.update({
                where: { id: tableId },
                data: { status: 'waiting' }
            });
        }
        io.emit('table:updated', { tableId });
        res.json({ success: true, message: 'Bots removed' });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [BOTS] Clear error:', errMsg);
        res.status(500).json({ error: String(error) });
    }
});
// ============ RESET PLAYER ============
app.post('/api/dev/reset-player', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Reset mode disabled in production' });
    }
    try {
        const { userId } = req.body;
        if (!userId)
            return res.status(400).json({ error: 'User ID missing' });
        console.log(`🔧 [DEV] Resetting player ${userId}`);
        const seat = await client_1.prisma.seat.findFirst({
            where: { userId, isSitting: true },
            include: { table: true }
        });
        if (!seat) {
            console.log(`🔧 [DEV] Player ${userId} is not at any table`);
            return res.json({ success: true, message: 'Player not at any table' });
        }
        console.log(`🔧 [DEV] Found player at table ${seat.tableId} seat ${seat.position}`);
        const wallet = await client_1.prisma.wallet.findUnique({
            where: { userId }
        });
        if (wallet) {
            await client_1.prisma.wallet.update({
                where: { userId },
                data: {
                    balance: wallet.balance + seat.stack,
                    locked: wallet.locked - seat.stack
                }
            });
            await client_1.prisma.walletTransaction.create({
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
        await client_1.prisma.seat.update({
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
        const seatedCount = await client_1.prisma.seat.count({
            where: { tableId: seat.tableId, isSitting: true }
        });
        if (seatedCount < 2) {
            await disposeGame(seat.tableId);
            await client_1.prisma.pokerTable.update({
                where: { id: seat.tableId },
                data: { status: 'waiting' }
            });
        }
        io.emit('table:updated', { tableId: seat.tableId });
        console.log(`✅ [DEV] Player ${userId} reset successfully`);
        res.json({
            success: true,
            message: 'Player reset successfully',
            tableId: seat.tableId
        });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [DEV] Reset error:', errMsg);
        res.status(500).json({ error: String(error) });
    }
});
// ============ RESET TABLE ============
app.post('/api/dev/reset-table', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Reset mode disabled in production' });
    }
    try {
        const { tableId } = req.body;
        console.log(`🔧 [DEV] Resetting table ${tableId}`);
        await disposeGame(tableId);
        const table = await client_1.prisma.pokerTable.findUnique({
            where: { id: tableId },
            include: {
                seats: {
                    where: { isSitting: true },
                    include: { user: true }
                }
            }
        });
        if (!table) {
            return res.status(404).json({ error: 'Table not found' });
        }
        const botUsers = table.seats
            .filter(seat => seat.user?.email?.includes('@poker.local') && seat.userId !== null)
            .map(seat => seat.user);
        const botUserIds = botUsers.map(u => u.id);
        const botWallets = await client_1.prisma.wallet.findMany({
            where: { userId: { in: botUserIds } }
        });
        const botWalletIds = botWallets.map(w => w.id);
        const allGames = await client_1.prisma.game.findMany({
            where: { tableId: tableId },
            select: { id: true }
        });
        const allGameIds = allGames.map(g => g.id);
        await client_1.prisma.$transaction(async (tx) => {
            if (botUserIds.length > 0) {
                await tx.gamePlayer.deleteMany({
                    where: { userId: { in: botUserIds } }
                });
                console.log(`🔧 [DEV] Deleted GamePlayers for bots`);
            }
            if (allGameIds.length > 0) {
                await tx.gamePlayer.deleteMany({
                    where: { gameId: { in: allGameIds } }
                });
                console.log(`🔧 [DEV] Deleted GamePlayers for all games on table`);
            }
            if (allGameIds.length > 0) {
                await tx.game.deleteMany({
                    where: { id: { in: allGameIds } }
                });
                console.log(`🔧 [DEV] Deleted games ${allGameIds.join(', ')}`);
            }
            await tx.seat.updateMany({
                where: { tableId: tableId },
                data: {
                    userId: null,
                    stack: 0,
                    isSitting: false,
                    isSitOut: false,
                    reservedAt: null,
                    reservedFor: null
                }
            });
            console.log(`🔧 [DEV] Reset all seats for table ${tableId}`);
            if (botWalletIds.length > 0) {
                await tx.walletTransaction.deleteMany({
                    where: { walletId: { in: botWalletIds } }
                });
                console.log(`🔧 [DEV] Deleted WalletTransactions for bots`);
            }
            if (botUserIds.length > 0) {
                await tx.wallet.deleteMany({
                    where: { userId: { in: botUserIds } }
                });
                console.log(`🔧 [DEV] Deleted Wallets for bots`);
            }
            if (botUserIds.length > 0) {
                await tx.user.deleteMany({
                    where: { id: { in: botUserIds } }
                });
                console.log(`🔧 [DEV] Deleted bot users ${botUserIds.join(', ')}`);
            }
            await tx.pokerTable.update({
                where: { id: tableId },
                data: {
                    status: 'waiting',
                    currentGameId: null
                }
            });
            console.log(`🔧 [DEV] Table ${tableId} set to waiting`);
            await tx.waitingList.deleteMany({
                where: { tableId: tableId }
            });
        });
        io.emit('table:updated', { tableId });
        console.log(`✅ [DEV] Table ${tableId} reset successfully`);
        res.json({ success: true, message: 'Table reset successfully' });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('❌ [DEV] Reset table error:', errMsg);
        res.status(500).json({ error: errMsg });
    }
});
// ============ DIAGNOSTIC ROUTE ============
app.get('/api/diagnostic/:tableId', async (req, res) => {
    try {
        const table = await client_1.prisma.pokerTable.findUnique({
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
        if (!table)
            return res.status(404).json({ error: 'Table not found' });
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
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: errMsg });
    }
});
// ============ ADMIN ROUTES ============
app.get('/api/admin/games', (req, res) => {
    res.json(Array.from(activeGames.keys()));
});
app.get('/api/admin/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), games: activeGames.size });
});
app.post('/api/admin/kick-player', async (req, res) => {
    const { userId, tableId } = req.body;
    // implement kick logic – remove from seat, refund, etc.
    res.json({ success: true });
});
app.post('/api/admin/reset-table', async (req, res) => {
    const { tableId } = req.body;
    try {
        await disposeGame(tableId);
        await client_1.prisma.seat.updateMany({
            where: { tableId },
            data: { userId: null, stack: 0, isSitting: false }
        });
        await client_1.prisma.pokerTable.update({
            where: { id: tableId },
            data: { status: 'waiting', currentGameId: null }
        });
        io.emit('table:updated', { tableId });
        res.json({ success: true });
    }
    catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Admin reset error:', errMsg);
        res.status(500).json({ error: errMsg });
    }
});
app.post('/api/admin/pause-game', async (req, res) => {
    res.json({ success: true });
});
app.post('/api/admin/resume-game', async (req, res) => {
    res.json({ success: true });
});
app.post('/api/admin/force-next-hand', async (req, res) => {
    res.json({ success: true });
});
app.get('/api/admin/logs', (req, res) => {
    res.json({ logs: [] });
});
app.get('/api/admin/tables', async (req, res) => {
    const tables = await client_1.prisma.pokerTable.findMany({ include: { seats: true } });
    res.json(tables);
});
app.get('/api/admin/sockets', (req, res) => {
    res.json({ sockets: [] });
});
// ============ HELPER: SEND TABLE STATE ============
async function sendTableState(socket, tableId) {
    let gameState = null;
    for (const [gameId, game] of activeGames) {
        if (game.getState().tableId === tableId) {
            gameState = game.getState();
            break;
        }
    }
    if (gameState) {
        socket.emit('game:state', gameState);
    }
    else {
        const table = await client_1.prisma.pokerTable.findUnique({
            where: { id: tableId },
            include: { seats: { where: { isSitting: true } } }
        });
        const seatedCount = table?.seats?.length || 0;
        socket.emit('game:state', {
            status: 'waiting',
            players: [],
            pot: 0,
            communityCards: [],
            currentBet: 0,
            seatedPlayers: seatedCount,
            tableId: tableId,
        });
    }
}
// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log(`🟢 [SOCKET] Player connected: ${socket.id}`);
    socket.on('set:userId', (userId) => {
        if (userId) {
            PokerGame_1.userSocketMap.set(userId, socket.id);
            socket.data.userId = userId;
            console.log(`✅ [SOCKET] Mapped user ${userId} to socket ${socket.id}`);
        }
    });
    socket.on('join:table', (data) => {
        let tableId;
        let userId;
        if (typeof data === 'string') {
            tableId = data;
        }
        else if (data && typeof data === 'object') {
            tableId = data.tableId;
            userId = data.userId;
            if (userId) {
                PokerGame_1.userSocketMap.set(userId, socket.id);
                socket.data.userId = userId;
                console.log(`✅ [SOCKET] Mapped user ${userId} to socket ${socket.id} via join:table`);
            }
        }
        else {
            return;
        }
        socket.join(`table:${tableId}`);
        console.log(`✅ [SOCKET] Socket ${socket.id} joined room table:${tableId}`);
        console.log(`📊 [SOCKET] Rooms: ${Array.from(socket.rooms).join(', ')}`);
        sendTableState(socket, tableId);
    });
    socket.on('leave:table', (tableId) => {
        socket.leave(`table:${tableId}`);
        console.log(`❌ [SOCKET] Socket ${socket.id} left room table:${tableId}`);
    });
    socket.on('request:game:state', (data) => {
        console.log(`📊 [SOCKET] Requesting game state for ${data.gameId}`);
        const game = activeGames.get(data.gameId);
        if (game) {
            socket.emit('game:state', game.getState());
        }
        else {
            const tableId = data.tableId || Array.from(socket.rooms).find(r => r.startsWith('table:'))?.replace('table:', '');
            if (tableId) {
                sendTableState(socket, tableId);
            }
            else {
                socket.emit('game:error', { message: 'No table found for game state request' });
            }
        }
    });
    // ---------- ACTION HANDLER (with validation and queue) ----------
    socket.on('game:action', async (data) => {
        if (!(0, security_1.validateAction)(socket, data)) {
            socket.emit('game:error', { message: 'Invalid action' });
            return;
        }
        try {
            const { gameId, userId, action, amount } = data;
            const game = activeGames.get(gameId);
            if (!game) {
                socket.emit('game:error', { message: 'Game not found' });
                return;
            }
            const result = await actionQueue.enqueue(gameId, () => game.processAction(userId, action, amount));
            io.to(`table:${gameId}`).emit('game:state', result);
            Logger_1.logger.info('Action processed', { gameId, userId, action, amount });
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            socket.emit('game:error', { message: errMsg });
            Logger_1.logger.error('Action error', { error: errMsg });
        }
    });
    // ---------- RECONNECT ----------
    socket.on('reconnect:request', async (data) => {
        const { userId, gameId } = data;
        const success = await reconnectManager.reconnectPlayer(userId, gameId);
        if (success) {
            const game = activeGames.get(gameId);
            if (game) {
                const state = game.getState();
                socket.emit('game:state', state);
                socket.join(`table:${gameId}`);
                Logger_1.logger.info('Player reconnected', { userId, gameId });
            }
        }
        else {
            socket.emit('reconnect:failed', { message: 'Could not restore game' });
        }
    });
    socket.on('disconnect', () => {
        for (const [userId, sid] of PokerGame_1.userSocketMap) {
            if (sid === socket.id) {
                PokerGame_1.userSocketMap.delete(userId);
                console.log(`❌ [SOCKET] Removed mapping for user ${userId}`);
                break;
            }
        }
        console.log(`🔴 [SOCKET] Player disconnected: ${socket.id}`);
    });
});
// ============ START SERVER ============
ensureTablesExist()
    .then(() => recoverOrphanedGames())
    .then(() => recoverGames())
    .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`✅ WebSocket server ready`);
    });
});
