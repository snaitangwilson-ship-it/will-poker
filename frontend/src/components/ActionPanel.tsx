import React, { useState, useEffect } from 'react';
import BetSlider from './BetSlider';

interface ActionPanelProps {
  canAct: boolean;
  onFold: () => void;
  onCheck: () => void;
  onCall: (amount: number) => void;
  onRaise: (amount: number) => void;
  onAllIn: () => void;
  callAmount: number;
  minRaise: number;
  maxRaise: number;
  currentBet: number;
  pot: number;
  stack: number;
  timer: number;
  bigBlind?: number;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  canAct,
  onFold,
  onCheck,
  onCall,
  onRaise,
  onAllIn,
  callAmount,
  minRaise,
  maxRaise,
  currentBet,
  pot,
  stack,
  timer,
  bigBlind = 20,
}) => {
  const [raiseAmount, setRaiseAmount] = useState(minRaise);

  useEffect(() => {
    if (raiseAmount < minRaise) setRaiseAmount(minRaise);
    if (raiseAmount > maxRaise) setRaiseAmount(maxRaise);
  }, [minRaise, maxRaise]);

  const handleRaise = () => {
    if (raiseAmount >= minRaise && raiseAmount <= maxRaise) {
      onRaise(raiseAmount);
    }
  };

  if (!canAct) {
    return (
      <div className="action-panel-dock text-center text-sm" style={{ color: 'var(--wp-text-dim)' }}>
        ⏳ Waiting for your turn...
      </div>
    );
  }

  return (
    <div className="action-panel-dock">
      <div className="action-panel">
        {/* Info bar */}
        <div className="info-bar">
          <span>⏱️ {timer}s</span>
          <span>Pot: ₹{pot}</span>
          <span>Stack: ₹{stack}</span>
          <span>Current bet: ₹{currentBet}</span>
        </div>

        {/* Action buttons */}
        <div className="button-row">
          <button onClick={onFold} className="act-btn btn-fold">
            Fold
          </button>

          {callAmount === 0 ? (
            <button onClick={onCheck} className="act-btn btn-check">
              Check
            </button>
          ) : (
            <button onClick={() => onCall(callAmount)} className="act-btn btn-call">
              Call ₹{callAmount}
            </button>
          )}

          <button onClick={handleRaise} className="act-btn btn-raise">
            Raise ₹{raiseAmount}
          </button>
        </div>

        {/* Bet slider */}
        <BetSlider
          min={minRaise}
          max={maxRaise}
          value={raiseAmount}
          onChange={setRaiseAmount}
          pot={pot}
          stack={stack}
          disabled={!canAct}
          onAllIn={onAllIn}
          bigBlind={bigBlind}
        />
      </div>
    </div>
  );
};

export default ActionPanel;