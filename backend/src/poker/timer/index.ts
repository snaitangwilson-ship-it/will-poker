export class PokerTimer {
  private timeoutId: NodeJS.Timeout | null = null;
  private remaining: number;
  private maxTime: number;

  constructor(maxTime: number) {
    this.maxTime = maxTime;
    this.remaining = maxTime;
  }

  start(callback: () => void): void {
    this.stop();
    this.remaining = this.maxTime;
    this.timeoutId = setTimeout(callback, this.maxTime);
  }

  reset(): void {
    this.remaining = this.maxTime;
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  getRemaining(): number {
    return this.remaining;
  }

  isRunning(): boolean {
    return this.timeoutId !== null;
  }
}
