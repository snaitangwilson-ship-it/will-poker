import React from 'react';

interface BetSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (val: number) => void;
  pot: number;
  stack: number;
  disabled?: boolean;
  bigBlind?: number;
  onAllIn?: () => void;
}

const BetSlider: React.FC<BetSliderProps> = ({
  min,
  max,
  value,
  onChange,
  pot,
  disabled = false,
  bigBlind = 20,
  onAllIn,
}) => {
  const clamp = (v: number) => Math.min(Math.max(Math.round(v), min), max);

  const presets = [
    { label: '2.5 BB', amount: clamp(bigBlind * 2.5) },
    { label: '3 BB', amount: clamp(bigBlind * 3) },
    { label: '4 BB', amount: clamp(bigBlind * 4) },
    { label: 'Pot', amount: clamp(pot || bigBlind) },
    { label: 'All In', amount: max, allIn: true },
  ];

  const handlePreset = (amount: number, isAllIn?: boolean) => {
    onChange(amount);
    if (isAllIn && onAllIn) onAllIn();
  };

  const step = (dir: 1 | -1) => onChange(clamp(value + dir * bigBlind));

  return (
    <div className="bet-slider-container">
      <div className="amount-row">
        <button type="button" className="stepper-btn" onClick={() => step(-1)} disabled={disabled}>−</button>
        <div className="amount-display">₹{value}</div>
        <button type="button" className="stepper-btn" onClick={() => step(1)} disabled={disabled}>+</button>
      </div>

      <div className="slider-row">
        <span className="slider-minmax">Min<br />₹{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
        <span className="slider-minmax max">Max<br />₹{max}</span>
      </div>

      <div className="quick-bets">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p.amount, p.allIn)}
            disabled={disabled}
            className={`${value === p.amount ? 'selected' : ''} ${p.allIn ? 'allin-preset' : ''}`}
          >
            <span>{p.label}</span>
            <span className="amt">₹{p.amount}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BetSlider;