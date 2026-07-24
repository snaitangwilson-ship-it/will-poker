import React from 'react';

interface WinnerBannerProps {
  winnerName: string;
  handRank: string;
  amount: number;
}

export const WinnerBanner: React.FC<WinnerBannerProps> = ({ winnerName, handRank, amount }) => {
  return (
    <div className="winner-banner">
      <div className="trophy">🏆</div>
      <div className="name">{winnerName}</div>
      <div className="hand">{handRank}</div>
      <div className="amount">+₹{amount}</div>
    </div>
  );
};
