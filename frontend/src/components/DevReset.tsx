// frontend/src/components/DevReset.tsx
import { useState } from 'react';
import { authFetch } from '../lib/authFetch';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';

interface DevResetProps {
  userId: string;
  tableId: string;
  onReset: () => void;
}

export const DevReset = ({ userId, tableId, onReset }: DevResetProps) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const resetPlayer = async () => {
    if (!confirm('Reset player? This will remove you from the table and return chips.')) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/dev/reset-player`, {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Player reset');
        onReset();
      } else {
        setMessage('❌ ' + (data.error || 'Failed to reset player'));
      }
    } catch (error) {
      console.error('Error resetting player:', error);
      setMessage('❌ Error resetting player');
    }
    setLoading(false);
  };

  const resetTable = async () => {
    if (!confirm('Reset entire table? All seats will be cleared.')) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await authFetch(`${BACKEND_URL}/api/dev/reset-table`, {
        method: 'POST',
        body: JSON.stringify({ tableId })
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✅ Table reset');
        onReset();
      } else {
        setMessage('❌ ' + (data.error || 'Failed to reset table'));
      }
    } catch (error) {
      console.error('Error resetting table:', error);
      setMessage('❌ Error resetting table');
    }
    setLoading(false);
  };

  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
      <h4 className="text-white font-bold mb-2">🛠️ Dev Tools</h4>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={resetPlayer}
          disabled={loading}
          className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-sm font-bold disabled:opacity-50"
        >
          Reset Player
        </button>
        <button
          onClick={resetTable}
          disabled={loading}
          className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-bold disabled:opacity-50"
        >
          Reset Table
        </button>
      </div>
      {message && <p className="text-sm mt-2 text-gray-300">{message}</p>}
    </div>
  );
};