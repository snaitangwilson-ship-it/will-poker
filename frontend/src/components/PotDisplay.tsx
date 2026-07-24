import React from 'react';

interface PotDisplayProps {
  pot: number;
  currentBet: number;
}

const PotDisplay: React.FC<PotDisplayProps> = ({ pot, currentBet }) => {
  return (
    <div className="pot-display flex items-center gap-6 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-yellow-500/30 shadow-lg">
      <div>
        <span className="text-gray-400 text-xs">Pot</span>
        <span className="pot-amount text-white font-bold ml-2">₹{pot}</span>
      </div>
      {currentBet > 0 && (
        <div>
          <span className="text-gray-400 text-xs">Current Bet</span>
          <span className="current-bet text-yellow-400 font-bold ml-2">₹{currentBet}</span>
        </div>
      )}
    </div>
  );
};

export default PotDisplay;