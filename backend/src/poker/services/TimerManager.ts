export class TimerManager {
  private timer: NodeJS.Timeout | null = null;
  private remaining: number = 0;
  private onTick?: (rem: number) => void;
  start(seconds: number, onTimeout: () => void, tickCallback?: (rem: number) => void) {
    this.stop();
    this.remaining = seconds;
    this.onTick = tickCallback;
    this.timer = setInterval(() => {
      this.remaining--;
      if (this.onTick) this.onTick(this.remaining);
      if (this.remaining <= 0) {
        this.stop();
        onTimeout();
      }
    }, 1000);
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  reset() { this.stop(); }
  getRemaining(): number { return this.remaining; }
}
