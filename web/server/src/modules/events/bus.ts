export interface BusMessage {
  event: 'tree' | 'document';
  data: unknown;
}

interface Subscriber {
  companyId: string;
  userId: string;
  sessionId: string;
  send: (m: BusMessage) => void;
  close: () => void;
}

const MAX_PER_USER = 10;

/** Company scoped fan-out used by the SSE endpoint. */
export class EventBus {
  private subs = new Set<Subscriber>();

  subscribe(sub: Subscriber): () => void {
    const mine = [...this.subs].filter((s) => s.userId === sub.userId);
    while (mine.length >= MAX_PER_USER) {
      const oldest = mine.shift()!;
      this.subs.delete(oldest);
      oldest.close();
    }
    this.subs.add(sub);
    return () => {
      this.subs.delete(sub);
    };
  }

  emit(companyId: string, event: BusMessage['event'], data: unknown = {}): void {
    for (const s of this.subs) {
      if (s.companyId !== companyId) continue;
      try {
        s.send({ event, data });
      } catch {
        this.subs.delete(s);
      }
    }
  }

  closeWhere(pred: (s: { companyId: string; userId: string; sessionId: string }) => boolean): void {
    for (const s of [...this.subs]) {
      if (pred(s)) {
        this.subs.delete(s);
        s.close();
      }
    }
  }

  closeAll(): void {
    this.closeWhere(() => true);
  }

  get size(): number {
    return this.subs.size;
  }
}
