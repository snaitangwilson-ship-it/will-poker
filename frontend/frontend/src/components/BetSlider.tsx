import React from 'react';

interface BetSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  quickBets: number[];
  onQuickBet: (val: number) => void;
  label: string;
}

export const BetSlider: React.FC<BetSliderProps> = ({
  min,
  max,
  value,
  onChange,
  quickBets,
  onQuickBet,
  label,
}) => {
  return (
    <div className="bet-slider-container">
      <div className="flex justify-between text-sm text-gray-300 mb-2">
        <span>Min: {min}</span>
        <span>{label}: {value}</span>
        <span>Max: {max}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="quick-bets mt-3">
        {quickBets.map((q) => (
          <button key={q} onClick={() => onQuickBet(q)}>{q === max ? 'ALL' : q}</button>
        ))}
      </div>
    </div>
  );
};
