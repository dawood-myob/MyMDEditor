/** Tiny typed pub/sub used to coordinate panels that must not know about each other (editor, preview, outline, search). */
export interface BusEvents {
  /** editor scrolled by the user; value is the fractional 0-based source line at the top of the viewport */
  'editor-scroll': number;
  /** preview scrolled by the user; same unit */
  'preview-scroll': number;
  /** jump to a source line: moves the editor cursor and scrolls both editor and preview */
  reveal: { line: number; from: 'outline' | 'search' | 'preview' | 'external' };
  /** editor cursor line changed (0-based) */
  cursor: number;
  'focus-editor': void;
  /** editor/preview layout changed size (panel resize, maximise, ...) */
  relayout: void;
}

type Handler<T> = (payload: T) => void;

export class WorkspaceBus {
  private handlers = new Map<keyof BusEvents, Set<Handler<never>>>();

  /** last known cursor line; read by late-mounting panels */
  cursorLine = 0;

  /** set when a search hit opens a document: the editor jumps to the first occurrence once the content is synced */
  pendingFind: { documentId: string; term: string } | null = null;

  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }

    set.add(handler as Handler<never>);
    return () => {
      set.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof BusEvents>(event: K, ...payload: BusEvents[K] extends void ? [] : [BusEvents[K]]): void {
    if (event === 'cursor') {
      this.cursorLine = payload[0] as number;
    }

    this.handlers.get(event)?.forEach((h) => (h as Handler<unknown>)(payload[0]));
  }
}

/** Time-based guard that prevents echo loops between two synchronised scrollers. */
export class LoopGuard {
  private until = 0;

  constructor(private readonly windowMs = 160) {}

  /** call right before a programmatic scroll */
  arm(): void {
    this.until = performance.now() + this.windowMs;
  }

  get active(): boolean {
    return performance.now() < this.until;
  }
}
