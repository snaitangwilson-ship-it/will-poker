import React from 'react';

interface HandHistoryModalProps {
  actions: string[];
  onClose: () => void;
}

export const HandHistoryModal: React.FC<HandHistoryModalProps> = ({ actions, onClose }) => {
  return (
    <div className="hand-history-modal" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        <h2 className="text-xl font-bold text-yellow-400 mb-4">Hand History</h2>
        <div className="space-y-1">
          {actions.map((action, i) => (
            <div key={i} className="text-sm text-gray-300">{action}</div>
          ))}
        </div>
      </div>
    </div>
  );
};
