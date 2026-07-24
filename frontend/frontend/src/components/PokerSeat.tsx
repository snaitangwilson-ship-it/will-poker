import React from 'react';
import { PokerCard } from './PokerCard';
import { TimerCircle } from './TimerCircle';

interface PokerSeatProps {
  seat: any;
  position: number;
  isMe: boolean;
  gameState: any;
  isWaiting: boolean;
  isMyTurn: boolean;
  timerActive: boolean;
  timeLeft: number;
  onSitHere?: () => void;
}

export const PokerSeat: React.FC<PokerSeatProps> = ({
  seat,
  isMe,
  gameState,
  isWaiting,
  isMyTurn,
  timerActive,
  timeLeft,
  onSitHere,
}) => {
  const isOccupied = seat.isSitting;
  const isDealer = gameState?.dealerPosition === seat.position;
  const isSB = gameState?.smallBlindPosition === seat.position;
  const isBB = gameState?.bigBlindPosition === seat.position;
  const isCurrent = gameState?.currentPlayerPosition === seat.position;
  const playerInGame = gameState?.players?.find((p: any) => p.position === seat.position);
  const holeCards = playerInGame?.holeCards || [];
  const isActivePlayer = playerInGame?.isActive && !playerInGame?.hasFolded;
  const isMyTurnSeat = isCurrent && isMe;

  if (!isOccupied) {
    return (
      <div className="seat">
        <div className="empty" onClick={onSitHere}>Sit Here</div>
      </div>
    );
  }

  return (
    <div className={`seat ${isMyTurnSeat && isActivePlayer ? 'active-seat' : ''}`}>
      {isDealer && <div className="badge dealer">D</div>}
      {isSB && <div className="badge sb">SB</div>}
      {isBB && <div className="badge bb">BB</div>}

      <div className="avatar">{seat.user?.name?.charAt(0) || '?'}</div>
      <div className="name">{isMe ? '⭐ You' : seat.user?.name}</div>
      <div className="stack">💰 ₹{seat.stack}</div>
      {playerInGame?.bet > 0 && (
        <div className="bet-stack">Bet ₹{playerInGame.bet}</div>
      )}
      {playerInGame?.hasFolded && <div className="status folded">FOLDED</div>}
      {playerInGame?.isAllIn && <div className="status allin">ALL-IN</div>}
      {isMe && !isWaiting && (
        <div className="hole-cards">
          {holeCards.length === 2 ? (
            holeCards.map((card: string, idx: number) => (
              <PokerCard key={idx} rank={card.slice(0, -1)} suit={card.slice(-1)} />
            ))
          ) : (
            <span>🃏🃏</span>
          )}
        </div>
      )}
      {!isMe && !isWaiting && !playerInGame?.hasFolded && !playerInGame?.isAllIn && (
        <div className="hole-cards">
          <PokerCard hidden /><PokerCard hidden />
        </div>
      )}
      {isMyTurnSeat && timerActive && (
        <div className="timer"><TimerCircle timeLeft={timeLeft} /></div>
      )}
    </div>
  );
};
