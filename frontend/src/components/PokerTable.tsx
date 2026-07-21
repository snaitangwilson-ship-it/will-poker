import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { BotControls } from './BotControls';

const BACKEND_URL = 'https://jubilant-umbrella-wr654p57g66xh5g95-4000.app.github.dev';

export default function PokerTable() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to table...');
  const [error, setError] = useState<string | null>(null);
  
  // Data State
  const [table, setTable] = useState<any>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [mySeat, setMySeat] = useState<any>(null);
  const [seatedPlayers, setSeatedPlayers] = useState(0);
  
  // User State
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  
  // Socket State
  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [tableDataLoaded, setTableDataLoaded] = useState(false);
  const [gameStateReceived, setGameStateReceived] = useState(false);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============ USER LOADING ============
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserId(user.id);
        setUserName(user.name);
        setWalletBalance(user.wallet?.balance || 0);
        console.log('✅ User loaded:', user.id, user.name);
      } catch (e) {
        console.error('Error parsing user:', e);
        setError('Session expired. Please login again.');
        setLoading(false);
        localStorage.removeItem('user');
        navigate('/');
        return;
      }
    } else {
      setError('Please login to access this table.');
      setLoading(false);
      navigate('/');
      return;
    }
  }, []);

  // ============ TABLE INITIALIZATION ============
  useEffect(() => {
    if (!userId || !tableId) {
      console.log('❌ Missing userId or tableId');
      return;
    }

    console.log(`🚀 Starting table initialization for ${tableId}`);
    setLoading(true);
    setLoadingMessage('Connecting to table...');
    setError(null);
    setGameStateReceived(false);
    setTableDataLoaded(false);
    setSocketConnected(false);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    setSocket(newSocket);

    // Socket event handlers
    newSocket.on('connect', () => {
      console.log('✅ Socket connected');
      setSocketConnected(true);
      setLoadingMessage('Connected. Loading table data...');
      newSocket.emit('join:table', tableId);
      console.log(`📤 Emitted join:table for ${tableId}`);
      fetchTableData();
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ Socket connection error:', err);
      setLoadingMessage('Connection error, retrying...');
    });

    newSocket.on('disconnect', (reason) => {
      console.log(`❌ Socket disconnected: ${reason}`);
      setSocketConnected(false);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Socket reconnected after ${attemptNumber} attempts`);
      setSocketConnected(true);
      newSocket.emit('join:table', tableId);
      fetchTableData();
    });

    newSocket.on('game:started', (data) => {
      console.log('🎯 GAME STARTED:', data);
      setLoadingMessage('Game starting...');
      newSocket.emit('request:game:state', { gameId: data.gameId });
    });

    newSocket.on('game:state', (data) => {
      console.log('🎯 GAME STATE RECEIVED:', data);
      console.log(`   Status: ${data.status}`);
      console.log(`   Players: ${data.players?.length || 0}`);
      console.log(`   Pot: ${data.pot}`);
      setGameState(data);
      setGameStateReceived(true);
    });

    newSocket.on('game:error', (data) => {
      console.error('❌ Game error:', data);
      setError('Game error: ' + data.message);
      setLoading(false);
    });

    newSocket.on('player:updated', (data) => {
      console.log('👤 Player updated:', data);
      if (data.userId === userId) {
        setMySeat((prev: any) => ({ ...prev, stack: data.stack }));
      }
    });

    newSocket.on('table:updated', () => {
      console.log('🔄 Table updated');
      fetchTableData();
    });

    fetchTableData();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (newSocket) {
        console.log('🧹 Cleaning up socket');
        newSocket.emit('leave:table', tableId);
        newSocket.disconnect();
      }
    };
  }, [userId, tableId]);

  // ============ LOADING STATE MANAGEMENT - THE FIX ============
  // This useEffect watches the required state variables
  // and clears loading ONLY when all conditions are met
  useEffect(() => {
    console.log(`📊 [Loading Check] socketConnected=${socketConnected}, tableDataLoaded=${tableDataLoaded}, error=${error}`);
    
    // If there's an error, don't clear loading
    if (error) {
      console.log('❌ Error present, keeping loading state');
      return;
    }

    // If socket is connected AND table data is loaded, we can render
    if (socketConnected && tableDataLoaded) {
      console.log('✅ All data loaded! Clearing loading state.');
      setLoading(false);
      setError(null);
    } else {
      // Show appropriate loading message
      if (!socketConnected) {
        setLoadingMessage('Connecting to server...');
      } else if (!tableDataLoaded) {
        setLoadingMessage('Loading table data...');
      }
    }
  }, [socketConnected, tableDataLoaded, error]);

  // ============ FETCH TABLE DATA ============
  const fetchTableData = async () => {
    try {
      setLoadingMessage('Loading table data...');
      console.log(`📊 Fetching table data for ${tableId}`);
      const res = await fetch(`${BACKEND_URL}/api/tables/${tableId}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('📊 Table data received:', data);
      
      const seated = data.seats?.filter((s: any) => s.isSitting).length || 0;
      setSeatedPlayers(seated);
      setTable(data);
      
      if (userId) {
        const mySeat = data.seats?.find((s: any) => s.userId === userId && s.isSitting);
        if (mySeat) {
          console.log('👤 My seat found:', mySeat);
          setMySeat(mySeat);
          setTableDataLoaded(true);
          // Do NOT call checkAllDataLoaded here - the useEffect will handle it
        } else {
          console.log('❌ User not seated at this table');
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

  // ============ REFRESH TABLE (for bot controls) ============
  const refreshTable = () => {
    fetchTableData();
  };

  // ============ RENDER STATES ============
  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <div className="text-white text-xl mb-2">Something went wrong</div>
          <div className="text-gray-400 text-sm mb-6">{error}</div>
          <div className="flex gap-4 justify-center">
            <button onClick={() => window.location.reload()} className="bg-yellow-600 hover:bg-yellow-500 px-6 py-2 rounded-lg text-white font-bold transition-all">🔄 Retry</button>
            <button onClick={() => navigate('/')} className="bg-gray-600 hover:bg-gray-500 px-6 py-2 rounded-lg text-white font-bold transition-all">🏠 Go to Lobby</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-white text-xl">{loadingMessage}</div>
          <div className="text-gray-400 text-sm mt-2">Table ID: {tableId}</div>
          <div className="text-gray-500 text-xs mt-4 flex flex-col gap-1">
            <div>{socketConnected ? '🟢 Connected' : '🔴 Connecting...'}</div>
            <div>{tableDataLoaded ? '📊 Table loaded' : '⏳ Loading table...'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!table || !mySeat) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-white text-xl">No table data available</div>
        <button onClick={() => navigate('/')} className="mt-4 bg-yellow-600 hover:bg-yellow-500 px-6 py-2 rounded-lg text-white font-bold">Return to Lobby</button>
      </div>
    );
  }

  // ============ RENDER TABLE ============
  const totalSeated = table.seats?.filter((s: any) => s.isSitting).length || 0;
  const needsMorePlayers = totalSeated < 2;
  const isWaiting = !gameState || gameState.status === 'waiting' || needsMorePlayers;
  const isMyTurn = gameState?.currentPlayerPosition === mySeat?.position;
  const activePlayers = gameState?.players?.filter((p: any) => p.isActive && !p.hasFolded)?.length || 0;

  console.log(`📊 Rendering table: ${table.name}`);
  console.log(`   Seated players: ${totalSeated}`);
  console.log(`   Needs more players: ${needsMorePlayers}`);
  console.log(`   Is waiting: ${isWaiting}`);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-950 p-4">
      <BotControls tableId={tableId} onBotsAdded={refreshTable} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-white/70 hover:text-white text-sm">← Back to Lobby</button>
          <h1 className="text-2xl font-bold text-white">{table.name}</h1>
          <span className="text-yellow-400 text-sm">Blinds: ₹{table.smallBlind}/₹{table.bigBlind}</span>
          <span className="text-white/50 text-sm">Players: {totalSeated}/{table.maxPlayers}</span>
          {gameStateReceived && <span className="text-green-400 text-xs">🟢 Live</span>}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-green-400">💰 ₹{walletBalance}</span>
        </div>
      </div>

      {needsMorePlayers && (
        <div className="mb-4 p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30 text-center">
          <div className="text-yellow-400 text-lg font-bold">⏳ Waiting for Players</div>
          <div className="text-white/70 text-sm">
            Players Seated: {totalSeated} / 2 minimum
            <br />
            Waiting for {2 - totalSeated} more player{2 - totalSeated > 1 ? 's' : ''} to join...
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <div className="text-gray-500 text-xs mt-2">
              💡 Use the "Add Bots" button above to test multiplayer
            </div>
          )}
        </div>
      )}

      <div className="relative bg-gradient-to-b from-green-800 to-green-900 rounded-3xl p-8 border-4 border-amber-800/50 shadow-2xl">
        {/* Community Cards */}
        <div className="flex justify-center gap-2 mb-4 min-h-[100px] items-center">
          {gameState?.communityCards && gameState.communityCards.length > 0 ? (
            gameState.communityCards.map((card: string, i: number) => (
              <div key={i} className="w-16 h-24 bg-white rounded-lg flex items-center justify-center text-2xl font-bold shadow-lg transform hover:scale-105 transition-transform">
                {card}
              </div>
            ))
          ) : (
            <div className="text-white/50 text-sm">Waiting for cards...</div>
          )}
        </div>

        {/* Pot */}
        <div className="text-center mb-4">
          <div className="text-yellow-400 font-bold text-xl">💰 Pot: ₹{gameState?.pot || 0}</div>
          <div className="text-white/50 text-sm">Current Bet: ₹{gameState?.currentBet || 0}</div>
        </div>

        {/* Seats */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => {
            const seat = table.seats?.find((s: any) => s.position === i);
            const isOccupied = seat?.isSitting;
            const isMe = seat?.userId === userId;
            const isDealer = gameState?.dealerPosition === i;
            const isSmallBlind = gameState?.smallBlindPosition === i;
            const isBigBlind = gameState?.bigBlindPosition === i;
            const isCurrent = gameState?.currentPlayerPosition === i;
            const playerInGame = gameState?.players?.find((p: any) => p.position === i);
            const isActive = playerInGame?.isActive && !playerInGame?.hasFolded;

            return (
              <div key={i} className={`p-2 rounded-lg border-2 transition-all duration-300 ${
                isCurrent ? 'border-yellow-400 bg-yellow-400/20 shadow-lg shadow-yellow-400/20' : 
                isOccupied ? 'border-green-700/30 bg-green-800/30' : 'border-green-700/20 bg-green-800/20'
              }`}>
                <div className="text-center">
                  <div className="text-xs text-white/50">Seat {i + 1}</div>
                  {isOccupied ? (
                    <>
                      <div className={`font-bold ${isMe ? 'text-yellow-400' : 'text-white'}`}>
                        {isMe ? '⭐ You' : seat.user?.name || 'Player'}
                      </div>
                      <div className="text-green-400 text-sm">₹{seat.stack}</div>
                      <div className="flex justify-center gap-1 text-xs flex-wrap">
                        {isDealer && <span className="text-yellow-400">🎯</span>}
                        {isSmallBlind && <span className="text-blue-400">SB</span>}
                        {isBigBlind && <span className="text-red-400">BB</span>}
                        {playerInGame?.hasFolded && <span className="text-gray-400">Folded</span>}
                        {playerInGame?.isAllIn && <span className="text-purple-400">All-in</span>}
                        {isCurrent && isActive && <span className="text-yellow-400 animate-pulse">⬅️ Acting</span>}
                        {seat.isSitOut && <span className="text-gray-400">Sit Out</span>}
                      </div>
                    </>
                  ) : (
                    <div className="text-white/30 text-sm">Empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Game Controls - Disabled when waiting */}
        {!isWaiting && gameState && isMyTurn && (
          <div className="mt-4 flex justify-center gap-2 flex-wrap">
            <button onClick={() => { if (!socket || !gameState) return; socket.emit('game:action', { gameId: gameState.gameId, userId, action: 'fold' }); }} className="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg text-white font-bold transition-all shadow-lg shadow-red-600/30">Fold</button>
            <button onClick={() => { if (!socket || !gameState) return; socket.emit('game:action', { gameId: gameState.gameId, userId, action: 'check' }); }} className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg text-white font-bold transition-all shadow-lg shadow-blue-600/30">Check</button>
            <button onClick={() => { if (!socket || !gameState) return; socket.emit('game:action', { gameId: gameState.gameId, userId, action: 'call' }); }} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg text-white font-bold transition-all shadow-lg shadow-green-600/30">Call ₹{gameState.currentBet}</button>
            <button onClick={() => { if (!socket || !gameState) return; const raiseAmount = Math.min(gameState.currentBet * 2 || 100, mySeat.stack); socket.emit('game:action', { gameId: gameState.gameId, userId, action: 'raise', amount: raiseAmount }); }} className="bg-yellow-600 hover:bg-yellow-500 px-6 py-2 rounded-lg text-white font-bold transition-all shadow-lg shadow-yellow-600/30">Raise</button>
            <button onClick={() => { if (!socket || !gameState) return; socket.emit('game:action', { gameId: gameState.gameId, userId, action: 'all_in' }); }} className="bg-purple-600 hover:bg-purple-500 px-6 py-2 rounded-lg text-white font-bold transition-all shadow-lg shadow-purple-600/30">All-in (₹{mySeat.stack})</button>
          </div>
        )}

        {!isWaiting && gameState && !isMyTurn && (
          <div className="mt-4 text-center text-white/70">
            {gameState.players?.find((p: any) => p.position === gameState.currentPlayerPosition)?.userId === userId ? '⏳ Your turn!' : `⏳ Waiting for ${gameState.players?.find((p: any) => p.position === gameState.currentPlayerPosition)?.userId || 'player'} to act...`}
          </div>
        )}

        {gameState?.actionHistory && gameState.actionHistory.length > 0 && (
          <div className="mt-4 max-h-24 overflow-y-auto bg-black/30 rounded-lg p-2">
            {gameState.actionHistory.slice(-5).map((action: string, i: number) => (
              <div key={i} className="text-white/70 text-sm">{action}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
  // ============ LEAVE TABLE ============
  const handleLeaveTable = async () => {
    if (!userId) return;
    
    const inHand = gameState?.status && ['preflop', 'flop', 'turn', 'river'].includes(gameState.status);
    if (inHand && !confirm('You are in the middle of a hand. Leave after this hand?')) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/table/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, inHand: inHand || false })
      });
      const data = await res.json();
      if (data.success) {
        // Update wallet
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
      console.error('Leave table error:', error);
      setMessage('❌ Error leaving table');
    }
  };
  // ============ LEAVE TABLE ============
  const handleLeaveTable = async () => {
    if (!userId) return;
    
    const inHand = gameState?.status && ['preflop', 'flop', 'turn', 'river'].includes(gameState.status);
    if (inHand && !confirm('You are in the middle of a hand. Leave after this hand?')) {
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/table/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, inHand: inHand || false })
      });
      const data = await res.json();
      if (data.success) {
        // Update wallet
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
      console.error('Leave table error:', error);
      setMessage('❌ Error leaving table');
    }
  };
