import React from 'react';

export const TimerCircle: React.FC<{ timeLeft: number }> = ({ timeLeft }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = (timeLeft / 20) * 100;
  const offset = circumference * (1 - progress / 100);
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="timer">
      <circle cx="22" cy="22" r={radius} fill="none" stroke="#333" strokeWidth="3" />
      <circle cx="22" cy="22" r={radius} fill="none" stroke="#D4AF37" strokeWidth="3"
        strokeDasharray={circumference} strokeDashoffset={offset} />
      <text x="22" y="27" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
        {timeLeft > 0 ? timeLeft : ''}
      </text>
    </svg>
  );
};
