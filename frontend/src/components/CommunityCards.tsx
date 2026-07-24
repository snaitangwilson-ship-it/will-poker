import React from 'react';
import PokerCard from './PokerCard';

interface CommunityCardsProps {
  cards: Array<string | { rank: string; suit: string } | null>;
}

const CommunityCards: React.FC<CommunityCardsProps> = ({ cards }) => {
  const slots = [...(cards || [])];
  while (slots.length < 5) slots.push(null);

  // Helper to parse a card string like "A♠" into { rank, suit }
  const parseCard = (card: string | { rank: string; suit: string } | null) => {
    if (!card) return null;
    if (typeof card === 'object') return card; // already parsed
    const rank = card.slice(0, -1);
    const suit = card.slice(-1);
    return { rank, suit };
  };

  return (
    <div className="flex gap-3 justify-center items-center community-cards">
      {slots.map((card, i) => {
        const parsed = parseCard(card);
        return (
          <div key={i} className="card-wrapper">
            <PokerCard
              rank={parsed?.rank}
              suit={parsed?.suit}
              faceDown={!card}
              size="xl"
            />
          </div>
        );
      })}
    </div>
  );
};

export default CommunityCards;