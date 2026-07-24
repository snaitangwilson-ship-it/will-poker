// frontend/src/components/BotControls.tsx
import { useState } from 'react';
import { authFetch } from '../lib/authFetch';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

interface BotControlsProps {
  tableId: string;
  onBotsAdded: () => void;
}

export const BotControls = ({ tableId, onBotsAdded }: BotControlsProps) => {
  const [count, setCount] = useState(1);
  const [buyIn, setBuyIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const addBots = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/dev/add-bots`, {
        method: 'POST',
        body: JSON.stringify({ tableId, count, buyInAmount: buyIn || undefined })
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${data.botsAdded} bot(s) added. Total seated: ${data.totalSeated}`);
        onBotsAdded();
      } else {
        setMessage('❌ ' + (data.error || 'Failed to add bots'));
      }
    } catch (error) {
      console.error('Error adding bots:', error);
      setMessage('❌ Error adding bots');
    }
    setLoading(false);
  };

  const clearBots = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/dev/clear-bots`, {
        method: 'POST',
        body: JSON.stringify({ tableId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Bots cleared');
        onBotsAdded();
      } else {
        setMessage('❌ ' + (data.error || 'Failed to clear bots'));
      }
    } catch (error) {
      console.error('Error clearing bots:', error);
      setMessage('❌ Error clearing bots');
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50 mb-4">
      <h4 className="text-white font-bold mb-2">🤖 Bot Controls</h4>
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label className="text-gray-400 text-xs block">Count</label>
          <input
            type="number"
            min={1}
            max={8}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            className="bg-gray-700/50 border border-gray-600/50 text-white px-2 py-1 rounded w-16"
          />
        </div>
        <div>
          <label className="text-gray-400 text-xs block">Buy-in (₹)</label>
          <input
            type="number"
            min={0}
            value={buyIn}
            onChange={(e) => setBuyIn(parseInt(e.target.value) || 0)}
            className="bg-gray-700/50 border border-gray-600/50 text-white px-2 py-1 rounded w-24"
          />
        </div>
        <button
          onClick={addBots}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1 rounded text-sm font-bold disabled:opacity-50"
        >
          {loading ? '...' : 'Add Bots'}
        </button>
        <button
          onClick={clearBots}
          disabled={loading}
          className="bg-red-600 hover:bg-red-500 text-white px-4 py-1 rounded text-sm font-bold disabled:opacity-50"
        >
          Clear Bots
        </button>
      </div>
      {message && <p className="text-sm mt-2 text-gray-300">{message}</p>}
    </div>
  );
};