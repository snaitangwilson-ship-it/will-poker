import React, { useState } from 'react';

const BACKEND_URL = 'https://jubilant-umbrella-wr654p57g66xh5g95-4000.app.github.dev';

interface DevResetProps {
  userId: string;
  tableId: string;
  onReset: () => void;
}

export function DevReset({ userId, tableId, onReset }: DevResetProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const resetPlayer = async () => {
    if (!userId) return;
    if (!confirm('Reset your player state? This will leave the table and return your chips.')) return;
    
    setIsLoading(true);
    setMessage('Resetting...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/dev/reset-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Player reset! Redirecting to lobby...');
        localStorage.removeItem('activeTable');
        setTimeout(() => {
          window.location.href = '/';
        }, 1000);
      } else {
        setMessage('❌ ' + (data.error || 'Reset failed'));
      }
    } catch (error) {
      setMessage('❌ Error resetting player');
    }
    setIsLoading(false);
  };

  const resetTable = async () => {
    if (!tableId) return;
    if (!confirm('Reset entire table? This will remove all players and bots.')) return;
    
    setIsLoading(true);
    setMessage('Resetting table...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/dev/reset-table`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Table reset!');
        onReset();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ ' + (data.error || 'Reset failed'));
      }
    } catch (error) {
      setMessage('❌ Error resetting table');
    }
    setIsLoading(false);
  };

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="bg-red-900/20 backdrop-blur-sm rounded-xl border border-red-500/30 p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-sm text-red-400 font-medium">⚠️ Development Reset</div>
        <button
          onClick={resetPlayer}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-500 px-4 py-1 rounded-lg text-white font-bold transition-all disabled:opacity-50"
        >
          {isLoading ? '...' : '🚪 Reset Player'}
        </button>
        <button
          onClick={resetTable}
          disabled={isLoading}
          className="bg-orange-600 hover:bg-orange-500 px-4 py-1 rounded-lg text-white font-bold transition-all disabled:opacity-50"
        >
          {isLoading ? '...' : '🗑️ Reset Table'}
        </button>
        {message && <span className={`text-sm ${message.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>{message}</span>}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        ⚡ Development tools - reset player state or entire table
      </div>
    </div>
  );
}
