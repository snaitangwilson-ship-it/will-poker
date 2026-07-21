import React, { useState } from 'react';

const BACKEND_URL = 'https://jubilant-umbrella-wr654p57g66xh5g95-4000.app.github.dev';

interface BotControlsProps {
  tableId: string;
  onBotsAdded: () => void;
}

export function BotControls({ tableId, onBotsAdded }: BotControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [botCount, setBotCount] = useState(1);
  const [message, setMessage] = useState('');

  const addBots = async () => {
    setIsLoading(true);
    setMessage('Adding bots...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/dev/add-bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          count: botCount,
          buyInAmount: 400
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ Added ${data.botsAdded} bot(s). Total seated: ${data.totalSeated}`);
        onBotsAdded();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ ' + (data.error || 'Failed to add bots'));
      }
    } catch (error) {
      setMessage('❌ Error adding bots');
    }
    setIsLoading(false);
  };

  const clearBots = async () => {
    setIsLoading(true);
    setMessage('Removing bots...');
    try {
      const res = await fetch(`${BACKEND_URL}/api/dev/clear-bots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Bots removed');
        onBotsAdded();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ ' + (data.error || 'Failed to remove bots'));
      }
    } catch (error) {
      setMessage('❌ Error removing bots');
    }
    setIsLoading(false);
  };

  // Only show in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div className="bg-gray-800/70 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 mb-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="text-sm text-gray-400 font-medium">🤖 Developer Mode</div>
        <div className="flex items-center gap-2">
          <label className="text-gray-300 text-sm">Bots:</label>
          <input
            type="number"
            min="1"
            max="8"
            value={botCount}
            onChange={(e) => setBotCount(Math.min(8, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-16 bg-gray-700/50 border border-gray-600/50 text-white px-2 py-1 rounded-lg focus:outline-none focus:border-yellow-500/50"
          />
        </div>
        <button
          onClick={addBots}
          disabled={isLoading}
          className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded-lg text-white font-bold transition-all disabled:opacity-50"
        >
          {isLoading ? '...' : '➕ Add Bots'}
        </button>
        <button
          onClick={clearBots}
          disabled={isLoading}
          className="bg-red-500/30 hover:bg-red-500/50 px-4 py-1 rounded-lg text-red-400 border border-red-500/30 transition-all disabled:opacity-50"
        >
          🗑️ Clear Bots
        </button>
        {message && <span className={`text-sm ${message.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>{message}</span>}
      </div>
      <div className="text-xs text-gray-500 mt-1">
        ⚡ Adds AI bots to test multiplayer flow. Available in development only.
      </div>
    </div>
  );
}
