export class ActionQueue {
  private queue: Map<string, Promise<any>> = new Map();

  async enqueue(gameId: string, action: () => Promise<any>): Promise<any> {
    const existing = this.queue.get(gameId);
    if (existing) {
      await existing;
    }
    const promise = action().finally(() => {
      if (this.queue.get(gameId) === promise) {
        this.queue.delete(gameId);
      }
    });
    this.queue.set(gameId, promise);
    return promise;
  }
}
