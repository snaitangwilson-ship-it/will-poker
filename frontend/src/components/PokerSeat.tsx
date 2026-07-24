import React from 'react';

interface PokerSeatProps {
  seat: any;
  position: number;
  isMe: boolean;
  gameState: any;
  isWaiting: boolean;
  isMyTurn: boolean;
  timerActive: boolean;
  timeLeft: number;
  isDealer?: boolean;
  isSB?: boolean;
  isBB?: boolean;
  onSitHere: () => void;
}

// Helper to parse card string like "A♠" into { rank, suit }
const parseCard = (card: string) => {
  if (!card) return null;
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { rank, suit };
};

const PokerSeat: React.FC<PokerSeatProps> = ({
  seat,
  position: _position,
  isMe,
  gameState,
  isWaiting: _isWaiting,
  isMyTurn,
  timerActive: _timerActive,
  timeLeft: _timeLeft,
  isDealer = false,
  isSB = false,
  isBB = false,
  onSitHere: _onSitHere,
}) => {
  if (!seat.isSitting) {
    return (
      <div className="seat">
        <div className="empty">Empty</div>
      </div>
    );
  }

  const player = gameState?.players?.find((p: any) => p.userId === seat.userId);
  const stack = player?.stack ?? seat.stack ?? 0;
  const name = seat.user?.name || 'Player';
  const isActive = player?.isActive ?? true;
  const hasFolded = player?.hasFolded ?? false;
  const isAllIn = player?.isAllIn ?? false;
  const holeCards = player?.holeCards ?? [];
  const initial = (name || '?').charAt(0).toUpperCase();

  return (
    <div className={`seat ${isMyTurn && isActive && !hasFolded ? 'active-seat' : ''}`}>
      {/* Hole cards */}
      <div className="hole-cards">
        {holeCards.length > 0 ? (
          holeCards.map((card: any, i: number) => {
            // Parse card if it's a string
            let rank, suit;
            if (typeof card === 'string') {
              const parsed = parseCard(card);
              rank = parsed?.rank;
              suit = parsed?.suit;
            } else if (card && typeof card === 'object') {
              // If card is already an object with rank/suit
              rank = card.rank;
              suit = card.suit;
            }
            const isRed = suit === '♥' || suit === '♦';
            return (
              <div
                key={i}
                className={`card-slot ${isMe ? 'face-up' : ''}`}
              >
                {isMe && rank && suit ? (
                  <div className="rank-suit">
                    <span className={isRed ? 'text-red-600' : 'text-black'}>
                      {rank}
                    </span>
                    <span className={`suit ${isRed ? 'text-red-600' : 'text-black'}`}>
                      {suit}
                    </span>
                  </div>
                ) : (
                  <span>♠</span>
                )}
              </div>
            );
          })
        ) : (
          <div className="card-slot">?</div>
        )}
      </div>

      <div className="relative">
        {/* Badges */}
        {isDealer && <div className="badge dealer">D</div>}
        {isSB && <div className="badge sb">SB</div>}
        {isBB && <div className="badge bb">BB</div>}
        <div className="avatar">{initial}</div>
      </div>

      {/* Player info */}
      <div className="name-pill">
        <div className="name">{name}{isMe ? ' (You)' : ''}</div>
        <div className="stack">₹{stack}</div>
        {hasFolded && <div className="status folded">Folded</div>}
        {isAllIn && <div className="status allin">All‑In</div>}
        {!isActive && !hasFolded && !isAllIn && (
          <div className="status">Sitting out</div>
        )}
        {isMyTurn && isActive && !hasFolded && !isAllIn && (
          <div className="status">Your turn</div>
        )}
      </div>
    </div>
  );
};

export default PokerSeat;