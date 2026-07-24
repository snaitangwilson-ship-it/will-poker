import React from 'react';

interface SoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export const SoundToggle: React.FC<SoundToggleProps> = ({ enabled, onToggle }) => {
  return (
    <button onClick={onToggle} className="text-sm text-gray-400 hover:text-white">
      {enabled ? '🔊' : '🔇'}
    </button>
  );
};
