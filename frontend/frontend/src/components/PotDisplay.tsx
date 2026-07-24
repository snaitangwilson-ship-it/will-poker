import React from 'react';

interface PotDisplayProps {
  pot: number;
  currentBet: number;
}

export const PotDisplay: React.FC<PotDisplayProps> = ({ pot, currentBet }) => {
  return (
    <div className="pot-display">
      <div className="pot-chips">🟡🟡🟡</div>
      <div className="pot-amount">Pot ₹{pot}</div>
      {currentBet > 0 && <div className="current-bet">Current Bet: ₹{currentBet}</div>}
    </div>
  );
};
