import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import PokerTable from './components/PokerTable';
import { authFetch } from './lib/authFetch';
import type { Table, BlindLevel, User } from './types';
import ProtectedRoute from './components/ProtectedRoute';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

function Lobby() {
  const [tables, setTables] = useState<Table[]>([]);
  const [blinds, setBlinds] = useState<BlindLevel[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [buyInAmount, setBuyInAmount] = useState(0);
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [joiningTable, setJoiningTable] = useState(false);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const navigate = useNavigate();

  // ---------- Fetch active table ----------
  const fetchActiveTable = async (userId: string) => {
    if (!userId) return;
    try {
      const res = await authFetch(`${BACKEND_URL}/api/user/active-table/${userId}`);
      const data = await res.json();
      if (data.hasActiveTable && data.tableId) {
        setActiveTableId(data.tableId);
      } else {
        setActiveTableId(null);
      }
    } catch (error) {
      console.error('Error fetching active table:', error);
      setActiveTableId(null);
    }
  };

  // ---------- Fetch wallet balance ----------
  const fetchWallet = async (userId: string) => {
    try {
      const res = await authFetch(`${BACKEND_URL}/api/wallet/${userId}`);
      const data = await res.json();
      setWalletBalance(data.balance || 0);
    } catch (error) {
      console.error('Error fetching wallet:', error);
    }
  };

  // ---------- Fetch blinds ----------
  const fetchBlinds = async () => {
    try {
      const res = await authFetch(`${BACKEND_URL}/api/blinds`);
      const data = await res.json();
      setBlinds(data);
    } catch (error) {
      console.error('Error fetching blinds:', error);
    }
  };

  // ---------- Fetch tables ----------
  const fetchTables = async () => {
    try {
      const res = await authFetch(`${BACKEND_URL}/api/tables`);
      const data = await res.json();
      setTables(data);
    } catch (error) {
      console.error('Error fetching tables:', error);
    }
  };

  // ---------- Initial load ----------
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    let user: User | null = null;
    if (storedUser) {
      try {
        user = JSON.parse(storedUser);
        if (user) {
          setUserId(user.id);
          setUserName(user.name);
          setWalletBalance(user.wallet?.balance || 0);
          fetchActiveTable(user.id);
          fetchWallet(user.id);
        } else {
          localStorage.removeItem('user');
        }
      } catch (e) {
        console.error('Error parsing stored user:', e);
        localStorage.removeItem('user');
      }
    }

    fetchBlinds();
    fetchTables();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });
    socket.on('table:updated', fetchTables);

    const interval = setInterval(() => {
      if (!joiningTable) fetchTables();
    }, 10000);

    setTimeout(() => setInitialLoading(false), 500);

    return () => {
      socket.off('table:updated');
      socket.disconnect();
      clearInterval(interval);
    };
  }, []);

  // ---------- Auth (login / register) ----------
  const handleAuth = async () => {
    setIsLoading(true);
    setMessage('');
    setMessageType('');
    const endpoint = isLogin ? '/login' : '/register';
    const body = isLogin ? { email, password } : { email, name: name || email.split('@')[0], password };
    try {
      const res = await fetch(`${BACKEND_URL}/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.id) {
        setUserId(data.id);
        setUserName(data.name || 'Player');
        setWalletBalance(data.wallet?.balance || 10000);
        localStorage.setItem('user', JSON.stringify(data));
        setMessage(`✅ Welcome ${data.name || 'Player'}!`);
        setMessageType('success');
        setEmail('');
        setName('');
        setPassword('');
        await fetchActiveTable(data.id);
        await fetchWallet(data.id);
      } else {
        setMessage('❌ ' + (data.error || 'Authentication failed'));
        setMessageType('error');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setMessage('❌ Error connecting to server');
      setMessageType('error');
    }
    setIsLoading(false);
  };

  // ---------- Logout ----------
  const handleLogout = () => {
    localStorage.removeItem('user');
    setUserId(null);
    setUserName('');
    setWalletBalance(0);
    setActiveTableId(null);
    setMessage('👋 Logged out successfully');
    setMessageType('success');
  };

  // ---------- Join table (with navigation delay) ----------
  const handleJoinTable = async () => {
    if (!userId || !selectedTable) {
      console.log('❌ Cannot join: missing userId or selectedTable');
      return;
    }

    if (buyInAmount < selectedTable.minBuyIn || buyInAmount > selectedTable.maxBuyIn) {
      setMessage(`❌ Buy-in must be between ₹${selectedTable.minBuyIn} and ₹${selectedTable.maxBuyIn}`);
      setMessageType('error');
      return;
    }

    if (buyInAmount > walletBalance) {
      setMessage(`❌ Insufficient balance. You have ₹${walletBalance}`);
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    setJoiningTable(true);
    setMessage('');
    setMessageType('');

    console.log(`🎯 Joining table ${selectedTable.id} with buy-in ${buyInAmount}`);

    try {
      const res = await authFetch(`${BACKEND_URL}/api/table/join`, {
        method: 'POST',
        body: JSON.stringify({
          userId,
          tableId: selectedTable.id,
          buyInAmount,
        }),
      });

      const data = await res.json();
      console.log('📥 Join response:', data);

      if (data.success) {
        setShowBuyIn(false);
        setSelectedTable(null);
        setWalletBalance((prev) => prev - buyInAmount);
        console.log(`✅ Join successful! Redirecting to /table/${selectedTable.id}`);
        // ✅ WAIT a moment before navigating to allow the server to create the game state
        setTimeout(() => {
          navigate(`/table/${selectedTable.id}`);
        }, 500);
      } else {
        setMessage('❌ ' + (data.error || 'Failed to join table'));
        setMessageType('error');
        setJoiningTable(false);
        if (userId) fetchWallet(userId);
      }
    } catch (error) {
      console.error('❌ Join table error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage('❌ ' + errorMessage);
      setMessageType('error');
      setJoiningTable(false);
      if (userId) fetchWallet(userId);
    }
    setIsLoading(false);
  };

  // ---------- Resume table ----------
  const handleResume = () => {
    if (activeTableId) {
      navigate(`/table/${activeTableId}`);
    }
  };

  // ---------- Loading screen ----------
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-white text-xl">Loading Poker Master...</div>
        </div>
      </div>
    );
  }

  // ---------- Joining screen ----------
  if (joiningTable) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <div className="text-white text-xl">Joining table...</div>
        </div>
      </div>
    );
  }

  // ---------- Login/Register page ----------
  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="text-7xl block mb-4">♠️</span>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
              Poker Master
            </h1>
            <p className="text-gray-400 mt-2">No Limit Hold'em Cash Games</p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-8 shadow-2xl">
            <div className="flex gap-2 mb-6 bg-gray-700/30 rounded-xl p-1">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                  isLogin
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🔐 Login
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 px-4 py-2.5 rounded-xl font-bold transition-all duration-300 ${
                  !isLogin
                    ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-500/25'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                ✨ Register
              </button>
            </div>

            <div className="space-y-4">
              <input
                className="w-full bg-gray-700/50 border border-gray-600/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-yellow-500/50"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {!isLogin && (
                <input
                  className="w-full bg-gray-700/50 border border-gray-600/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-yellow-500/50"
                  placeholder="Display Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <input
                className="w-full bg-gray-700/50 border border-gray-600/50 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-yellow-500/50"
                placeholder="Password (min 8 chars)"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                onClick={handleAuth}
                disabled={isLoading}
                className={`w-full py-3.5 rounded-xl font-bold text-white transition-all duration-300 ${
                  isLogin
                    ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:shadow-lg hover:shadow-blue-500/25'
                    : 'bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg hover:shadow-green-500/25'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? '⏳ Processing...' : isLogin ? '🔐 Login' : '✨ Create Account'}
              </button>
              {message && (
                <div
                  className={`p-3 rounded-xl text-sm ${
                    messageType === 'success'
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}
                >
                  {message}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Logged-in Lobby ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-400 p-1">
        <div className="bg-gray-900/95 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">♠️</span>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                  Poker Master
                </h1>
                <span className="text-sm text-gray-400">NLH Cash Games</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-green-400 font-medium">🟢 {userName}</span>
                <span className="bg-gray-800/50 px-4 py-2 rounded-full text-white border border-gray-700/50">
                  💰 ₹{walletBalance}
                </span>
                {activeTableId && (
                  <button
                    onClick={handleResume}
                    className="bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-full text-black font-bold border border-yellow-400/50 transition-all"
                  >
                    🚀 Resume Table
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  className="bg-red-500/20 hover:bg-red-500/30 px-4 py-2 rounded-full text-red-400 border border-red-500/30"
                >
                  🚪 Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {message && (
          <div
            className={`mb-4 p-4 rounded-xl ${
              messageType === 'success'
                ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {message}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left sidebar: Blind levels */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6 shadow-2xl sticky top-4">
              <h2 className="text-xl font-bold text-white mb-4">🏷️ Blind Levels</h2>
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                {blinds.map((level) => (
                  <div
                    key={level.smallBlind}
                    className="bg-gray-700/30 rounded-lg p-3 hover:bg-gray-700/50 transition-all duration-300 border border-gray-600/30"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-bold text-sm">{level.name}</div>
                        <div className="text-gray-400 text-xs">
                          Buy-in: ₹{level.minBuyIn} - ₹{level.maxBuyIn}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 text-xs font-bold">🟢 OPEN</div>
                        <div className="text-gray-500 text-xs">9 seats</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main area: Tables */}
          <div className="flex-1">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white">🏆 Cash Game Tables</h2>
                <div className="flex gap-4 text-sm">
                  <span className="text-gray-400">
                    Tables: <span className="text-white font-bold">{tables.length}</span>
                  </span>
                  <span className="text-gray-400">
                    Players:{' '}
                    <span className="text-white font-bold">
                      {tables.reduce(
                        (acc, t) =>
                          acc + (t.seats?.filter((s) => s.isSitting).length || 0),
                        0
                      )}
                    </span>
                  </span>
                </div>
              </div>

              {tables.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">No tables available.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tables
                    .filter((t) => t.status !== 'finished')
                    .map((table) => {
                      const seated = table.seats?.filter((s) => s.isSitting).length || 0;
                      const isFull = seated >= table.maxPlayers;
                      const isMyTable = activeTableId === table.id;

                      return (
                        <div
                          key={table.id}
                          className={`bg-gray-700/30 rounded-xl p-4 border-2 transition-all duration-300 ${
                            isMyTable
                              ? 'border-yellow-500/50 bg-yellow-500/10'
                              : isFull
                              ? 'border-red-500/30'
                              : 'border-green-500/30'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-white font-bold">{table.name}</h3>
                              <p className="text-gray-400 text-sm">NLH Cash Game</p>
                              <p className="text-gray-400 text-sm">
                                Blinds: ₹{table.smallBlind}/₹{table.bigBlind}
                              </p>
                              <p className="text-gray-400 text-sm">
                                Buy-in: ₹{table.minBuyIn} - ₹{table.maxBuyIn}
                              </p>
                            </div>
                            <div className="text-right">
                              {isMyTable && (
                                <span className="block text-yellow-400 text-xs font-bold mb-1">
                                  ⭐ Your Table
                                </span>
                              )}
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-bold ${
                                  isFull
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-green-500/20 text-green-400'
                                }`}
                              >
                                {isFull ? '🔴 FULL' : '🟢 OPEN'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-gray-400 text-sm">
                              Players: {seated}/{table.maxPlayers}
                            </span>
                            {isMyTable ? (
                              <button
                                onClick={handleResume}
                                className="px-4 py-1 rounded-lg text-sm font-bold bg-yellow-600 hover:bg-yellow-500 text-black transition-all"
                              >
                                Resume
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedTable(table);
                                  setBuyInAmount(table.minBuyIn);
                                  setShowBuyIn(true);
                                }}
                                disabled={isFull || isLoading}
                                className="px-4 py-1 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Join
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Buy-in Modal */}
      {showBuyIn && selectedTable && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full border border-gray-700 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-2">Join {selectedTable.name}</h2>
            <p className="text-gray-400 text-sm mb-4">
              Buy-in: ₹{selectedTable.minBuyIn} - ₹{selectedTable.maxBuyIn}
            </p>
            <p className="text-gray-400 text-sm mb-4">Your Balance: ₹{walletBalance}</p>
            <div className="mb-4">
              <label className="text-gray-300 text-sm block mb-2">
                Buy-in Amount: ₹{buyInAmount}
              </label>
              <input
                type="range"
                min={selectedTable.minBuyIn}
                max={Math.min(selectedTable.maxBuyIn, walletBalance)}
                step={50}
                value={buyInAmount}
                onChange={(e) => setBuyInAmount(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>₹{selectedTable.minBuyIn}</span>
                <span>₹{Math.min(selectedTable.maxBuyIn, walletBalance)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <input
                type="number"
                value={buyInAmount}
                onChange={(e) => setBuyInAmount(parseInt(e.target.value) || 0)}
                className="flex-1 bg-gray-700/50 border border-gray-600/50 text-white px-4 py-2 rounded-xl focus:outline-none focus:border-yellow-500/50"
                min={selectedTable.minBuyIn}
                max={Math.min(selectedTable.maxBuyIn, walletBalance)}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleJoinTable}
                disabled={isLoading || buyInAmount > walletBalance}
                className={`flex-1 px-4 py-2 rounded-xl text-white font-bold transition-all ${
                  buyInAmount > walletBalance
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-500'
                }`}
              >
                {isLoading ? 'Joining...' : 'Join Table'}
              </button>
              <button
                onClick={() => {
                  setShowBuyIn(false);
                  setSelectedTable(null);
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-xl text-white font-bold"
              >
                Cancel
              </button>
            </div>
            {buyInAmount > walletBalance && (
              <p className="text-red-400 text-sm mt-2">⚠️ Insufficient balance</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- App ----------
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route
          path="/table/:tableId"
          element={
            <ProtectedRoute>
              <PokerTable />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;