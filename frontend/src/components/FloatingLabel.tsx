import React, { useEffect, useState } from 'react';

interface FloatingLabelProps {
  userId: string;
  label: string;
  amount?: number;
}

export const FloatingLabel: React.FC<FloatingLabelProps> = ({ userId, label, amount }) => {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="floating-label">
      {label} {amount !== undefined ? `₹${amount}` : ''}
    </div>
  );
};
