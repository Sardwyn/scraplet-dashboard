// eventBus.js
// Dashboard 'Live Bus' for pushing real-time events to connected clients via SSE
export class EventBus {
  constructor() {
    this.listeners = new Map(); // userId -> Set(res)
  }

  subscribe(userId, res) {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId).add(res);

    res.on('close', () => {
      this.listeners.get(userId).delete(res);
    });
  }

  publish(userId, event) {
    const set = this.listeners.get(userId);
    if (!set) return;

    const msg = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of set) {
      res.write(msg);
    }
  }
}
