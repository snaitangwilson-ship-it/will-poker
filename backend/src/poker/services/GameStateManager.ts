// backend/src/poker/services/GameStateManager.ts

export class GameStateManager {
  private current: string;

  constructor(initialState: string = 'WAITING') {
    this.current = initialState;
  }

  // Reset to the initial state (WAITING)
  reset(): void {
    this.current = 'WAITING';
  }

  // Transition to a new state (with validation)
  transitionTo(newState: string): void {
    const validTransitions: Record<string, string[]> = {
      'WAITING': ['DEALER_ASSIGN'],
      'DEALER_ASSIGN': ['POST_SB'],
      'POST_SB': ['POST_BB'],
      'POST_BB': ['DEAL_HOLE'],
      'DEAL_HOLE': ['PREFLOP'],
      'PREFLOP': ['FLOP', 'SHOWDOWN', 'FINISHED'],
      'FLOP': ['TURN', 'SHOWDOWN', 'FINISHED'],
      'TURN': ['RIVER', 'SHOWDOWN', 'FINISHED'],
      'RIVER': ['SHOWDOWN', 'FINISHED'],
      'SHOWDOWN': ['FINISHED'],
      'FINISHED': ['WAITING'], // allow restart
    };

    const allowed = validTransitions[this.current] || [];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid transition from ${this.current} to ${newState}`);
    }
    this.current = newState;
  }

  getState(): string {
    return this.current;
  }
}