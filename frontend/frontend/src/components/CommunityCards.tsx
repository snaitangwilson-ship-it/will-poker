import React from 'react';
import { PokerCard } from './PokerCard';

interface CommunityCardsProps {
  cards?: string[];
}

export const CommunityCards: React.FC<CommunityCardsProps> = ({ cards = [] }) => {
  const placeholders = Array.from({ length: 5 }, (_, i) => i < cards.length ? cards[i] : null);
  return (
    <div className="community-cards">
      {placeholders.map((card, i) => (
        card ? (
          <PokerCard key={i} rank={card.slice(0, -1)} suit={card.slice(-1)} />
        ) : (
          <PokerCard key={i} hidden />
        )
      ))}
    </div>
  );
};
