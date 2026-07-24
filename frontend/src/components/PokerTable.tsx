import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { BotControls } from './BotControls';
import { DevReset } from './DevReset';
import PokerSeat from './PokerSeat';
import CommunityCards from './CommunityCards';
import PotDisplay from './PotDisplay';
import ActionPanel from './ActionPanel';
import { FloatingLabel } from './FloatingLabel';
import { WinnerBanner } from './WinnerBanner';
import { ChatPanel } from './ChatPanel';
import { HandHistoryModal } from './HandHistoryModal';
import { SoundToggle } from './SoundToggle';
import { sounds } from './sounds';
import { authFetch } from '../lib/authFetch';
import './PokerTable.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

const BASE_SEAT_POSITIONS = [
  { top: '5%', left: '50%' },
  { top: '15%', left: '82%' },
  { top: '38%', left: '92%' },
  { top: '62%', left: '92%' },
  { top: '85%', left: '82%' },
  { top: '95%', left: '50%' },
  { top: '85%', left: '18%' },
  { top: '62%', left: '8%' },
  { top: '38%', left: '8%' },
];

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

  // Timer
  const [timeLeft, setTimeLeft] = useState(20);
  const [timerActive, setTimerActive] = useState(false);

  // Chat
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [sitOutNextHand, setSitOutNextHand] = useState(false);
  const [autoRebuy, setAutoRebuy] = useState(true);

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
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
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
      setTimerActive(false);
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
      if (data.actionHistory) {
        setHandHistoryActions(data.actionHistory);
      }
      if (data.status === 'finished' || data.status === 'showdown') {
        setTimerActive(false);
      }
      if (data.status === 'finished' && data.winnerId) {
        const winnerPlayer = data.players.find((p: any) => p.userId === data.winnerId);
        if (winnerPlayer) {
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
    });

    newSocket.on('timer:tick', (data) => {
      console.log('⏱️ Timer tick:', data);
      setTimeLeft(data.remaining);
      setTimerActive(true);
      if (data.remaining <= 5 && soundEnabled) sounds.timer_warning();
    });

    newSocket.on('timer:stop', () => {
      setTimerActive(false);
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

    newSocket.on('chat:message', (data) => {
      setChatMessages(prev => [...prev, data]);
    });

    newSocket.on('system:message', (msg) => {
      setChatMessages(prev => [...prev, { userId: 'system', userName: 'System', message: msg, system: true, timestamp: Date.now() }]);
    });

    fetchTableData();

    return () => {
      if (newSocket) {
        newSocket.emit('leave:table', tableId);
        newSocket.disconnect();
      }
    };
  }, [userId, tableId]);

  // ---------- Fetch Table (using authFetch) ----------
  const fetchTableData = async () => {
    try {
      setLoadingMessage('Loading table data...');
      const res = await authFetch(`${BACKEND_URL}/api/tables/${tableId}`);
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
    }
  }, [socketConnected, tableDataLoaded]);

  // ---------- Actions ----------
  const sendAction = (action: string, amount?: number) => {
    if (!socket || !gameState) return;
    const payload: any = { gameId: gameState.gameId, userId, action };
    if (amount !== undefined) payload.amount = amount;
    socket.emit('game:action', payload);

    const label = action.toUpperCase();
    if (userId) {
      setFloatingLabels(prev => [...prev, { userId, label, amount }]);
      setTimeout(() => setFloatingLabels(prev => prev.filter(f => f.userId !== userId)), 2000);
    }

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

  const canAct = isMyTurn() && isActive();

  const callAmount = (): number => {
    const p = myPlayer();
    if (!p) return 0;
    return Math.min((gameState?.currentBet || 0) - p.bet, p.stack);
  };

  const minRaise = (): number => {
    const currentBet = gameState?.currentBet || 0;
    const bb = gameState?.bigBlind || 20;
    return currentBet === 0 ? bb : Math.max(currentBet + bb, currentBet + 1);
  };

  const maxRaise = (): number => {
    const p = myPlayer();
    return p ? p.stack : 0;
  };

  // ---------- Leave ----------
  const handleLeave = async () => {
    if (!userId) return;
    const inHand = gameState?.status && ['preflop', 'flop', 'turn', 'river'].includes(gameState.status);
    if (inHand && !confirm('Leave after current hand?')) return;
    try {
      const res = await authFetch(`${BACKEND_URL}/api/table/leave`, {
        method: 'POST',
        body: JSON.stringify({ userId, inHand: inHand || false })
      });
      const data = await res.json();
      if (data.success) {
        const walletRes = await authFetch(`${BACKEND_URL}/api/wallet/${userId}`);
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
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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
  const isMyTurnFlag = isMyTurn();

  // Seat rotation
  const userSeatIndex = table.seats?.findIndex((s: any) => s.userId === userId && s.isSitting) ?? -1;
  const rotatedSeats = table.seats?.map((seat: any, index: number) => {
    let displayIndex = index;
    if (userSeatIndex >= 0) {
      displayIndex = (index - userSeatIndex + 5) % 9;
    }
    return { ...seat, displayIndex };
  }) || [];
  rotatedSeats.sort((a: any, b: any) => a.displayIndex - b.displayIndex);

  // Determine dealer, SB, BB positions from gameState
  const dealerPos = gameState?.dealerPosition ?? -1;
  const sbPos = gameState?.sbPosition ?? -1;
  const bbPos = gameState?.bbPosition ?? -1;

  return (
    <div className="wp-app font-sans relative">
      {/* Debug overlay – hidden in production */}
      {import.meta.env.DEV && (
        <div className="absolute top-16 left-4 z-50 bg-black/80 text-xs p-2 rounded border border-yellow-500/30 max-w-xs pointer-events-none">
          <div>gameState: {gameState ? '✅' : '❌'}</div>
          <div>status: {gameState?.status || 'none'}</div>
          <div>isMyTurn: {isMyTurnFlag ? '✅' : '❌'}</div>
          <div>isActive: {isActive() ? '✅' : '❌'}</div>
          <div>timer: {timerActive ? `⏱️ ${timeLeft}s` : '⏹️'}</div>
        </div>
      )}

      {/* ------ Top Bar ------ */}
      <div className="wp-topbar">
        <div className="wp-logo">
          <span className="mark">♠</span>
          WILL POKER
        </div>

        <div className="wp-table-nav">
          <span className="chev">‹</span>
          <strong>NLH ₹{table.smallBlind}/₹{table.bigBlind}</strong>
          <span>{table.name}</span>
          <span>#{tableId?.slice(0, 8) || table.id?.slice(0, 8)}</span>
          <span className="chev">›</span>
        </div>

        <div className="wp-topbar-right">
          <button onClick={() => setShowHandHistory(true)} className="wp-icon-btn" title="Hand history">📜</button>
          <div className="wp-icon-btn">
            <SoundToggle enabled={soundEnabled} onToggle={() => setSoundEnabled(!soundEnabled)} />
          </div>
          <button className="wp-buychips-btn">Buy Chips</button>
          <div className="wp-wallet-chip">₹{walletBalance} <span style={{ opacity: 0.6 }}>⌄</span></div>
          <div className="wp-avatar-dot" />
        </div>
      </div>

      <div className="wp-layout">
        {/* ------ Left Sidebar ------ */}
        <div className="wp-side-left">
          <div className="wp-side-panel">
            <div className="label">Hand ID</div>
            <div className="value">#{gameState?.gameId?.slice(0, 12) || '—'}</div>
            <div className="label">Blinds</div>
            <div className="value">₹{table.smallBlind} / ₹{table.bigBlind}</div>
            <div className="label">Next Blind In</div>
            <div className="value">—</div>
            <button className="wp-rules-btn" onClick={() => setShowHandHistory(true)}>Game Rules</button>
          </div>

          <div className="wp-side-panel">
            <div className="row"><span>Players</span><strong>{totalSeated}/{table.maxPlayers}</strong></div>
            <label className="wp-checkline">
              <input type="checkbox" checked={sitOutNextHand} onChange={(e) => setSitOutNextHand(e.target.checked)} />
              Sit out next hand
            </label>
            <label className="wp-checkline">
              <input type="checkbox" checked={autoRebuy} onChange={(e) => setAutoRebuy(e.target.checked)} />
              Auto Rebuy — Min ₹{table.minBuyIn || 400}
            </label>
          </div>
        </div>

        {/* ------ Center Column ------ */}
        <div className="relative flex flex-col items-center justify-start">
        <div className="relative w-full max-w-4xl aspect-[16/9] table-container">
          <div className="table-watermark">WILL POKER</div>

          {/* ------ Timer Display ------ */}
          {timerActive && timeLeft > 0 && gameState && gameState.status !== 'finished' && gameState.status !== 'showdown' && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-yellow-400 text-xl font-bold px-6 py-2 rounded-full border-2 border-yellow-500/50 shadow-lg z-20 pointer-events-none">
              ⏱️ {timeLeft}s
            </div>
          )}

          {/* ------ Seats ------ */}
          {rotatedSeats.map((seat: any, displayIndex: number) => {
            const pos = BASE_SEAT_POSITIONS[displayIndex];
            const player = gameState?.players?.find((p: any) => p.userId === seat.userId);
            const isDealer = player?.position === dealerPos;
            const isSB = player?.position === sbPos;
            const isBB = player?.position === bbPos;

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
                  isWaiting={needsMorePlayers}
                  isMyTurn={isMyTurnFlag}
                  timerActive={timerActive}
                  timeLeft={timeLeft}
                  isDealer={isDealer}
                  isSB={isSB}
                  isBB={isBB}
                  onSitHere={() => console.log('Sit here clicked for seat', seat.position)}
                />
              </div>
            );
          })}

          {/* ------ Community Cards ------ */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '38%' }}>
            <CommunityCards cards={gameState?.communityCards || []} />
          </div>

          {/* ------ Pot Display – moved up ------ */}
          <div className="absolute left-1/2 transform -translate-x-1/2 pointer-events-none" style={{ top: '52%' }}>
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
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-yellow-500/20 border border-yellow-400/50 px-4 py-1 rounded-full text-yellow-400 text-sm font-bold animate-pulse pointer-events-none">
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

        {/* ------ Action Panel – ALWAYS RENDERED ------ */}
        <ActionPanel
          canAct={canAct}
          onFold={() => sendAction('fold')}
          onCheck={() => sendAction('check')}
          onCall={(amount) => sendAction('call', amount)}
          onRaise={(amount) => sendAction('raise', amount)}
          onAllIn={() => sendAction('all_in')}
          callAmount={callAmount()}
          minRaise={minRaise()}
          maxRaise={maxRaise()}
          currentBet={gameState?.currentBet || 0}
          pot={gameState?.pot || 0}
          stack={myPlayer()?.stack || 0}
          timer={timeLeft}
          bigBlind={table.bigBlind}
        />

        {/* ------ Hand History Modal ------ */}
        {showHandHistory && (
          <HandHistoryModal actions={handHistoryActions} onClose={() => setShowHandHistory(false)} />
        )}

        {/* ------ Dev Tools – hidden in production ------ */}
        {import.meta.env.DEV && tableId && userId && (
          <div className="mt-4 w-full max-w-4xl">
            <BotControls tableId={tableId} onBotsAdded={() => fetchTableData()} />
            <DevReset userId={userId} tableId={tableId} onReset={() => fetchTableData()} />
          </div>
        )}

        {message && (
          <div className="mt-2 p-2 bg-gray-800/50 rounded-lg text-white text-sm">
            {message}
          </div>
        )}
        </div>

        {/* ------ Right Sidebar ------ */}
        <div className="wp-side-right">
          <div className="flex gap-2 mb-3">
            {import.meta.env.DEV && tableId ? (
              <button
                className="wp-addbot-btn flex-1"
                onClick={async () => {
                  await authFetch(`${BACKEND_URL}/api/dev/add-bots`, {
                    method: 'POST',
                    body: JSON.stringify({ tableId, count: 1 }),
                  });
                  fetchTableData();
                }}
              >
                Add Bot
              </button>
            ) : (
              <span className="flex-1" />
            )}
            <button className="wp-leave-btn flex-1" onClick={handleLeave}>Leave Table</button>
          </div>

          <ChatPanel
            messages={chatMessages}
            onSend={sendChat}
            isCollapsed={chatCollapsed}
            onToggle={() => setChatCollapsed(!chatCollapsed)}
          />
        </div>
      </div>
    </div>
  );
}