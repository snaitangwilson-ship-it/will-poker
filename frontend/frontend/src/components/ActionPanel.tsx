import React from 'react';

interface ActionPanelProps {
  buttons: {
    showFold: boolean;
    showCheck: boolean;
    showCall: boolean;
    showBet: boolean;
    showRaise: boolean;
    showAllIn: boolean;
    callAmount?: number;
  };
  onAction: (action: string, amount?: number) => void;
  isLoading: boolean;
  onBet: () => void;
  onRaise: () => void;
}

export const ActionPanel: React.FC<ActionPanelProps> = ({
  buttons,
  onAction,
  isLoading,
  onBet,
  onRaise,
}) => {
  return (
    <div className="action-panel">
      {buttons.showFold && (
        <button className="btn-fold" onClick={() => onAction('fold')} disabled={isLoading}>Fold</button>
      )}
      {buttons.showCheck && (
        <button className="btn-check" onClick={() => onAction('check')} disabled={isLoading}>Check</button>
      )}
      {buttons.showCall && (
        <button className="btn-call" onClick={() => onAction('call')} disabled={isLoading}>
          Call ₹{buttons.callAmount || 0}
        </button>
      )}
      {buttons.showBet && (
        <button className="btn-bet" onClick={onBet} disabled={isLoading}>Bet</button>
      )}
      {buttons.showRaise && (
        <button className="btn-raise" onClick={onRaise} disabled={isLoading}>Raise</button>
      )}
      {buttons.showAllIn && (
        <button className="btn-allin" onClick={() => onAction('all_in')} disabled={isLoading}>All-In</button>
      )}
    </div>
  );
};
