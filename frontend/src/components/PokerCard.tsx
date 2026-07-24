import React from 'react';

interface PokerCardProps {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const PokerCard: React.FC<PokerCardProps> = ({
  rank,
  suit,
  faceDown = false,
  size = 'lg',
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-10 h-14 text-xs',
    md: 'w-14 h-20 text-sm',
    lg: 'w-18 h-26 text-base',
    xl: 'w-24 h-32 text-xl',
  };

  const suitColor = suit === '♥' || suit === '♦' ? 'text-red-600' : 'text-black';

  if (faceDown) {
    return (
      <div
        className={`
          ${sizeMap[size]}
          bg-gradient-to-br from-[#1c1c40] to-[#0a0a1e]
          rounded-lg shadow-lg border-2 border-[#8a6f24]
          flex items-center justify-center
          ${className}
        `}
      >
        <span className="text-[#d4af37] text-2xl opacity-60">♠</span>
      </div>
    );
  }

  if (!rank || !suit) {
    return (
      <div
        className={`
          ${sizeMap[size]} 
          bg-black/30 rounded-lg border-2 border-dashed border-white/10 
          flex items-center justify-center
          ${className}
        `}
      >
        <span className="text-white/30 text-xl">?</span>
      </div>
    );
  }

  return (
    <div
      className={`
        ${sizeMap[size]}
        bg-[#f5f1e6] rounded-lg shadow-xl border-2 border-[#d9d3bd]
        flex flex-col items-center justify-center p-1 relative
        ${className}
      `}
    >
      <div className={`font-bold text-sm ${suitColor}`}>{rank}</div>
      <div className={`text-3xl ${suitColor}`}>{suit}</div>
    </div>
  );
};

export default PokerCard;