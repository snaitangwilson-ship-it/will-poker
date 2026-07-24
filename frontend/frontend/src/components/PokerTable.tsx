import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { BotControls } from './BotControls';
import { DevReset } from './DevReset';
import { PokerSeat } from './PokerSeat';
import { CommunityCards } from './CommunityCards';
import { PotDisplay } from './PotDisplay';
import { ActionPanel } from './ActionPanel';
import { BetSlider } from './BetSlider';
import { FloatingLabel } from './FloatingLabel';
import { WinnerBanner } from './WinnerBanner';
import { ChatPanel } from './ChatPanel';
import { HandHistoryModal } from './HandHistoryModal';
import { SoundToggle } from './SoundToggle';
import { sounds } from './sounds';
import './PokerTable.css';

const BACKEND_URL = 'https://jubilant-umbrella-wr654p57g66xh5g95-4000.app.github.dev';

// ---------- Helpers ----------
const formatCurrency = (amount: number) => `₹${amount}`;

// Pre‑defined seat positions (9 seats around oval)
const SEAT_POSITIONS = [
  { top: '5%', left: '50%' },   // 0 – top center
  { top: '15%', left: '82%' },  // 1 – top right
  { top: '38%', left: '92%' },  // 2 – right upper
  { top: '62%', left: '92%' },  // 3 – right lower
  { top: '85%', left: '82%' },  // 4 – bottom right
  { top: '95%', left: '50%' },  // 5 – bottom center
  { top: '85%', left: '18%' },  // 6 – bottom left
  { top: '62%', left: '8%' },   // 7 – left lower
  { top: '38%', left: '8%' },   // 8 – left upper
];

// ---------- Main Component ----------
export default function PokerTable() {
  const { tableId } = useParams();
  const navigate = useNavigate();

  // ---------- State ----------
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to table...');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const [table, setTable] = useState<any>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [mySeat, setMySeat] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);

  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [tableDataLoaded, setTableDataLoaded] = useState(false);

  // Action panel
  const [showBetPanel, setShowBetPanel] = useState(false);
  const [betAmount, setBetAmount] = useState(0);
  const [minBet, setMinBet] = useState(0);
  const [maxBet, setMaxBet] = useState(0);
  const [quickBets, setQuickBets] = useState<number[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Timer
  const [timeLeft, setTimeLeft] = useState(20);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(true);

  // Hand history
  const [handHistoryActions, setHandHistoryActions] = useState<string[]>([]);
  const [showHandHistory, setShowHandHistory] = useState(false);

  // Floating labels
  const [floatingLabels, setFloatingLabels] = useState<{ userId: string; label: string; amount?: number }[]>([]);

  // Winner
  const [winner, setWinner] = useState<{ name: string; hand: string; amount: number } | null>(null);

  // Sound
  const [soundEnabled, setSoundEnabled] = useState(true);

  // ---------- User Loading ----------
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserId(user.id);
        setUserName(user.name);
        setWalletBalance(user.wallet?.balance || 0);
      } catch (e) {
        setError('Session expired. Please login again.');
        setLoading(false);
        localStorage.removeItem('user');
        navigate('/');
      }
    } else {
      setError('Please login to access this table.');
      setLoading(false);
      navigate('/');
    }
  }, []);

  // ---------- Socket & Table Init ----------
  useEffect(() => {
    if (!userId || !tableId) return;

    setLoading(true);
    setLoadingMessage('Connecting to table...');
    setError(null);
    setTableDataLoaded(false);
    setSocketConnected(false);

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      if (userId) newSocket.emit('set:userId', userId);
      setSocketConnected(true);
      setLoadingMessage('Connected. Loading table data...');
      newSocket.emit('join:table', { tableId, userId });
      fetchTableData();
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err);
      setLoadingMessage('Connection error, retrying...');
    });

    newSocket.on('disconnect', () => {
      setSocketConnected(false);
      clearTimer();
    });

    newSocket.on('reconnect', (attempt) => {
      console.log(`🔄 Reconnected after ${attempt} attempts`);
      setSocketConnected(true);
      if (userId) newSocket.emit('set:userId', userId);
      newSocket.emit('join:table', { tableId, userId });
      fetchTableData();
    });

    newSocket.on('game:started', (data) => {
      console.log('🎯 GAME STARTED:', data);
      newSocket.emit('request:game:state', { gameId: data.gameId, tableId });
    });

    newSocket.on('game:state', (data) => {
      console.log('🎯 GAME STATE RECEIVED:', data);
      setGameState(data);
      // Update hand history from actions
      if (data.actionHistory) {
        setHandHistoryActions(data.actionHistory);
      }
      // Check for winner
      if (data.status === 'finished' && data.winnerId) {
        const winnerPlayer = data.players.find((p: any) => p.userId === data.winnerId);
        if (winnerPlayer) {
          // Determine hand rank (simplified; backend should provide it)
          const handRank = winnerPlayer.handRank || 'Win';
          setWinner({
            name: winnerPlayer.userId,
            hand: handRank,
            amount: data.pot || 0,
          });
          if (soundEnabled) sounds.winner();
        }
        setTimeout(() => setWinner(null), 5000);
      }
      checkTimer(data);
    });

    newSocket.on('game:error', (data) => {
      console.error('❌ Game error:', data);
      setError('Game error: ' + data.message);
      setLoading(false);
    });

    newSocket.on('player:updated', (data) => {
      if (data.userId === userId) {
        setMySeat((prev: any) => ({ ...prev, stack: data.stack }));
      }
    });

    newSocket.on('table:updated', () => {
      fetchTableData();
    });

    // Chat messages (if backend sends them)
    newSocket.on('chat:message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    // System message
    newSocket.on('system:message', (msg) => {
      setChatMessages(prev => [...prev, { userId: 'system', userName: 'System', message: msg, system: true, timestamp: Date.now() }]);
    });

    fetchTableData();

    return () => {
      clearTimer();
      if (newSocket) {
        newSocket.emit('leave:table', tableId);
        newSocket.disconnect();
      }
    };
  }, [userId, tableId]);

  // ---------- Timer ----------
  const clearTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimerActive(false);
  };

  const startTimer = (seconds: number) => {
    clearTimer();
    setTimeLeft(seconds);
    setTimerActive(true);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearTimer();
          if (soundEnabled) sounds.timer_warning();
          return 0;
        }
        if (prev === 5 && soundEnabled) sounds.timer_warning();
        return prev - 1;
      });
    }, 1000);
  };

  const checkTimer = (state: any) => {
    if (!state) return;
    const currentPlayer = state.players?.find((p: any) => p.position === state.currentPlayerPosition);
    if (!currentPlayer) return;
    const isMyTurn = currentPlayer.userId === userId;
    if (isMyTurn && state.status !== 'finished' && state.status !== 'showdown') {
      startTimer(20);
    } else {
      clearTimer();
    }
  };

  // ---------- Fetch Table ----------
  const fetchTableData = async () => {
    try {
      setLoadingMessage('Loading table data...');
      const res = await fetch(`${BACKEND_URL}/api/tables/${tableId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      console.log('📊 Table data received:', data);
      setTable(data);
      if (userId) {
        const mySeat = data.seats?.find((s: any) => s.userId === userId && s.isSitting);
        if (mySeat) {
          setMySeat(mySeat);
          setTableDataLoaded(true);
        } else {
          setError('You are not seated at this table.');
          setLoading(false);
          setTimeout(() => navigate('/'), 2000);
        }
      }
    } catch (err) {
      console.error('❌ Fetch table error:', err);
      setError('Failed to load table data. Please try again.');
      setLoading(false);
    }
  };

  // ---------- Loading Logic ----------
  useEffect(() => {
    if (socketConnected && tableDataLoaded) {
      setLoading(false);
      setError(null);
      if (gameState) checkTimer(gameState);
    }
  }, [socketConnected, tableDataLoaded, gameState]);

  // ---------- Actions ----------
  const sendAction = (action: string, amount?: number) => {
    if (!socket || !gameState || isActionLoading) return;
    setIsActionLoading(true);
    const payload: any = { gameId: gameState.gameId, userId, action };
    if (amount !== undefined) payload.amount = amount;
    socket.emit('game:action', payload);
    setShowBetPanel(false);
    clearTimer();

    // Add floating label
    const label = action.toUpperCase();
    setFloatingLabels(prev => [...prev, { userId, label, amount }]);
    setTimeout(() => setFloatingLabels(prev => prev.filter(f => f.userId !== userId)), 2000);

    // Play sound
    if (soundEnabled) {
      switch (action) {
        case 'fold': sounds.fold(); break;
        case 'check': sounds.check(); break;
        case 'call': sounds.call(); break;
        case 'bet': sounds.bet(); break;
        case 'raise': sounds.raise(); break;
        case 'all_in': sounds.allin(); break;
        default: break;
      }
    }

    setTimeout(() => setIsActionLoading(false), 500);
  };

  const openBetPanel = (type: 'bet' | 'raise') => {
    const myPlayer = gameState?.players?.find((p: any) => p.userId === userId);
    if (!myPlayer) return;
    const currentBet = gameState.currentBet || 0;
    const minRaise = gameState.smallBlind * 2;
    const minBetAmount = type === 'bet' ? gameState.smallBlind : Math.max(currentBet + minRaise, currentBet + 1);
    const maxBetAmount = myPlayer.stack;
    setMinBet(minBetAmount);
    setMaxBet(maxBetAmount);
    setBetAmount(Math.min(minBetAmount, maxBetAmount));
    const pot = gameState.pot || 0;
    const isPreflop = gameState.status === 'preflop';
    const bb = gameState.bigBlind || 20;
    let quick: number[] = [];
    if (isPreflop) {
      quick = [2, 2.5, 3, 4].map(m => m * bb);
    } else {
      quick = [0.25, 0.5, 0.75, 1, 1.5].map(p => Math.round(p * pot));
    }
    quick = quick.filter(q => q >= minBetAmount && q <= maxBetAmount);
    if (pot >= minBetAmount && pot <= maxBetAmount) quick.push(pot);
    if (maxBetAmount >= minBetAmount) quick.push(maxBetAmount);
    quick = Array.from(new Set(quick)).sort((a, b) => a - b);
    setQuickBets(quick);
    setShowBetPanel(true);
  };

  const handleBetChange = (val: number) => {
    if (val < minBet) val = minBet;
    if (val > maxBet) val = maxBet;
    setBetAmount(val);
  };

  const handleQuickBet = (val: number) => {
    setBetAmount(Math.min(Math.max(val, minBet), maxBet));
  };

  // ---------- Helpers ----------
  const isMyTurn = (): boolean => {
    if (!gameState || !userId) return false;
    const currentPlayer = gameState.players?.find((p: any) => p.position === gameState.currentPlayerPosition);
    return currentPlayer?.userId === userId;
  };

  const myPlayer = (): any => {
    return gameState?.players?.find((p: any) => p.userId === userId);
  };

  const isActive = (): boolean => {
    const p = myPlayer();
    return p?.isActive && !p?.hasFolded && !p?.isAllIn && (p?.stack || 0) > 0;
  };

  const shouldShowActionPanel = (): boolean => {
    if (!gameState || !userId) return false;
    if (gameState.status === 'finished' || gameState.status === 'showdown') return false;
    return isMyTurn() && isActive();
  };

  const getActionButtons = () => {
    const currentBet = gameState?.currentBet || 0;
    const myPlayerStack = myPlayer()?.stack || 0;
    const hasBet = currentBet > 0;
    const canRaise = myPlayerStack > currentBet;

    if (!hasBet) {
      return {
        showCheck: true,
        showBet: true,
        showFold: false,
        showCall: false,
        showRaise: false,
        showAllIn: myPlayerStack > 0,
      };
    } else {
      const callAmount = Math.min(currentBet - (myPlayer()?.bet || 0), myPlayerStack);
      return {
        showCheck: false,
        showBet: false,
        showFold: true,
        showCall: true,
        showRaise: canRaise,
        showAllIn: myPlayerStack > 0,
        callAmount,
      };
    }
  };

  // ---------- Leave ----------
  const handleLeave = async () => {
    if (!userId) return;
    const inHand = gameState?.status && ['preflop', 'flop', 'turn', 'river'].includes(gameState.status);
    if (inHand && !confirm('Leave after current hand?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/table/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, inHand: inHand || false })
      });
      const data = await res.json();
      if (data.success) {
        const walletRes = await fetch(`${BACKEND_URL}/api/wallet/${userId}`);
        const walletData = await walletRes.json();
        if (walletData) {
          const storedUser = localStorage.getItem('user');
          if (storedUser) {
            const user = JSON.parse(storedUser);
            user.wallet = { balance: walletData.balance };
            localStorage.setItem('user', JSON.stringify(user));
          }
        }
        navigate('/');
      } else {
        setMessage('❌ ' + (data.error || 'Failed to leave table'));
      }
    } catch (error) {
      console.error('Leave error:', error);
    }
  };

  // ---------- Chat ----------
  const sendChat = (msg: string) => {
    if (!socket || !userId) return;
    socket.emit('chat:message', {
      tableId,
      userId,
      userName,
      message: msg,
    });
  };

  // ---------- Render ----------
  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <div className="text-white text-xl mb-2">Something went wrong</div>
          <div className="text-gray-400 text-sm mb-6">{error}</div>
          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="bg-yellow-600 hover:bg-yellow-500 px-6 py-2 rounded-lg text-white font-bold">🔄 Retry</button>
            <button onClick={() => navigate('/')} className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded-lg text-white font-bold">🏠 Lobby</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-white text-xl">{loadingMessage}</div>
          <div className="text-gray-400 text-sm mt-2">Table ID: {tableId}</div>
        </div>
      </div>
    );
  }

  if (!table || !mySeat) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-white text-xl">No table data</div>
        <button onClick={() => navigate('/')} className="mt-4 bg-yellow-600 hover:bg-yellow-500 px-6 py-2 rounded-lg text-white font-bold">Return to Lobby</button>
      </div>
    );
  }

  // ---------- Main Render ----------
  const totalSeated = table.seats?.filter((s: any) => s.isSitting).length || 0;
  const needsMorePlayers = totalSeated < 2;
  const isWaiting = !gameState || gameState.status === 'waiting' || needsMorePlayers;
  const isMyTurnFlag = isMyTurn();
  const actionButtons = getActionButtons();

  return (
    <div className="min-h-screen bg-black text-white font-sans relative">
      {/* ------ Top Nav ------ */}
      <div className="bg-[#1A1A1A]/90 backdrop-blur border-b border-yellow-600/30 px-4 py-2 flex flex-wrap justify-between items-center">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-yellow-500 text-2xl font-bold">♠ Poker Master</span>
          <span className="text-gray-300 text-sm hidden md:inline">{table.name}</span>
          <span className="text-yellow-400 text-sm hidden md:inline">Blinds: ₹{table.smallBlind}/₹{table.bigBlind}</span>
          <span className="text-gray-400 text-sm">Players: {totalSeated}/{table.maxPlayers}</span>
          <span className="text-yellow-300 text-sm font-mono bg-black/30 px-2 py-1 rounded hidden lg:inline-block">
            {gameState?.status ? gameState.status.toUpperCase() : 'WAITING'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-green-400 font-bold text-sm hidden sm:inline">💰 {formatCurrency(walletBalance)}</span>
          <button onClick={() => setShowHandHistory(true)} className="text-gray-400 hover:text-white text-sm">📜</button>
          <SoundToggle enabled={soundEnabled} onToggle={() => setSoundEnabled(!soundEnabled)} />
          <button onClick={handleLeave} className="bg-red-600/80 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-bold">Leave</button>
        </div>
      </div>

      {/* ------ Table Container ------ */}
      <div className="relative flex flex-col items-center justify-center px-4 pt-4 pb-24 md:pb-4">
        <div className="relative w-full max-w-5xl aspect-[16/9] rounded-[50%] bg-gradient-to-b from-green-800 to-green-950 border-8 border-yellow-700/50 shadow-2xl shadow-yellow-900/30 table-container">
          {/* Inner glow */}
          <div className="absolute inset-0 rounded-[50%] shadow-inner shadow-black/60 pointer-events-none" />

          {/* ------ Seats ------ */}
          {table.seats?.map((seat: any, index: number) => {
            const pos = SEAT_POSITIONS[index % SEAT_POSITIONS.length];
            return (
              <div
                key={seat.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ top: pos.top, left: pos.left }}
              >
                <PokerSeat
                  seat={seat}
                  position={seat.position}
                  isMe={seat.userId === userId}
                  gameState={gameState}
                  isWaiting={isWaiting}
                  isMyTurn={isMyTurnFlag}
                  timerActive={timerActive}
                  timeLeft={timeLeft}
                  onSitHere={() => console.log('Sit here clicked for seat', seat.position)}
                />
              </div>
            );
          })}

          {/* ------ Community Cards ------ */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '40%' }}>
            <CommunityCards cards={gameState?.communityCards} />
          </div>

          {/* ------ Pot Display ------ */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 pointer-events-none">
            <PotDisplay pot={gameState?.pot || 0} currentBet={gameState?.currentBet || 0} />
          </div>

          {/* ------ Waiting Overlay ------ */}
          {needsMorePlayers && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-[50%] backdrop-blur-sm pointer-events-none">
              <div className="text-yellow-400 text-2xl md:text-4xl font-bold">⏳ Waiting for Players</div>
              <div className="text-gray-300 text-sm md:text-lg">Seated: {totalSeated} / 2 minimum</div>
            </div>
          )}

          {/* ------ Your Turn Label ------ */}
          {isMyTurnFlag && isActive() && !needsMorePlayers && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500/20 border border-yellow-400/50 px-4 py-1 rounded-full text-yellow-400 text-sm font-bold animate-pulse pointer-events-none">
              YOUR TURN
            </div>
          )}

          {/* ------ Floating Labels ------ */}
          {floatingLabels.map((label, idx) => (
            <div key={idx} className="absolute" style={{ top: '30%', left: '50%', transform: 'translateX(-50%)' }}>
              <FloatingLabel userId={label.userId} label={label.label} amount={label.amount} />
            </div>
          ))}

          {/* ------ Winner Banner ------ */}
          {winner && (
            <WinnerBanner winnerName={winner.name} handRank={winner.hand} amount={winner.amount} />
          )}
        </div>

        {/* ------ Action Panel ------ */}
        {shouldShowActionPanel() && (
          <div className="fixed bottom-0 left-0 right-0 bg-[#1A1A1A]/95 backdrop-blur border-t border-yellow-600/30 p-3 z-50 md:relative md:bg-transparent md:border-0 md:p-2 md:mt-4 w-full max-w-4xl mx-auto">
            <ActionPanel
              buttons={actionButtons}
              onAction={sendAction}
              isLoading={isActionLoading}
              onBet={() => openBetPanel('bet')}
              onRaise={() => openBetPanel('raise')}
            />
          </div>
        )}

        {/* ------ Bet Slider ------ */}
        {showBetPanel && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-[#1A1A1A] border border-yellow-600/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <h3 className="text-yellow-400 text-xl font-bold mb-2 text-center">Bet Amount</h3>
              <BetSlider
                min={minBet}
                max={maxBet}
                value={betAmount}
                onChange={handleBetChange}
                quickBets={quickBets}
                onQuickBet={handleQuickBet}
                label="Amount"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => sendAction('bet', betAmount)} disabled={isActionLoading}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg font-bold disabled:opacity-50">
                  {isActionLoading ? 'Sending...' : 'Confirm'}
                </button>
                <button onClick={() => setShowBetPanel(false)} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded-lg font-bold">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------ Chat Panel ------ */}
        <ChatPanel
          messages={chatMessages}
          onSend={sendChat}
          isCollapsed={chatCollapsed}
          onToggle={() => setChatCollapsed(!chatCollapsed)}
        />

        {/* ------ Hand History Modal ------ */}
        {showHandHistory && (
          <HandHistoryModal actions={handHistoryActions} onClose={() => setShowHandHistory(false)} />
        )}

        {/* ------ Dev Tools ------ */}
        <div className="mt-4 w-full max-w-4xl">
          <BotControls tableId={tableId} onBotsAdded={() => fetchTableData()} />
          <DevReset userId={userId} tableId={tableId} onReset={() => fetchTableData()} />
        </div>

        {/* Message */}
        {message && (
          <div className="mt-2 p-2 bg-gray-800/50 rounded-lg text-white text-sm">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
