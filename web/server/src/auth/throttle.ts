interface Entry {
  fails: number;
  lockedUntil: number;
  lastAt: number;
}

/** In-memory throttle: per IP+company+username failure lockout and per-IP attempt window. */
export class LoginThrottle {
  private entries = new Map<string, Entry>();
  private ipWindows = new Map<string, number[]>();

  constructor(
    private maxFailures: number,
    private lockoutMs: number,
    private maxPerMinute: number,
  ) {}

  private key(ip: string, company: string, username: string): string {
    return `${ip}|${company.toLowerCase()}|${username.toLowerCase()}`;
  }

  /** Records an attempt for the IP; returns retry seconds when over the limit. */
  hitIp(ip: string, now = Date.now()): number | null {
    const win = (this.ipWindows.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (win.length >= this.maxPerMinute) {
      this.ipWindows.set(ip, win);
      return Math.max(1, Math.ceil((60_000 - (now - win[0]!)) / 1000));
    }
    win.push(now);
    this.ipWindows.set(ip, win);
    return null;
  }

  lockedSeconds(ip: string, company: string, username: string, now = Date.now()): number | null {
    const e = this.entries.get(this.key(ip, company, username));
    if (e && e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
    return null;
  }

  fail(ip: string, company: string, username: string, now = Date.now()): void {
    const k = this.key(ip, company, username);
    const e = this.entries.get(k) ?? { fails: 0, lockedUntil: 0, lastAt: now };
    if (e.lockedUntil && e.lockedUntil <= now) {
      e.fails = 0;
      e.lockedUntil = 0;
    }
    e.fails++;
    e.lastAt = now;
    if (e.fails >= this.maxFailures) e.lockedUntil = now + this.lockoutMs;
    this.entries.set(k, e);
    if (this.entries.size > 50_000) this.prune(now);
  }

  success(ip: string, company: string, username: string): void {
    this.entries.delete(this.key(ip, company, username));
  }

  prune(now = Date.now()): void {
    for (const [k, e] of this.entries) if (e.lockedUntil <= now && now - e.lastAt > this.lockoutMs) this.entries.delete(k);
    for (const [ip, w] of this.ipWindows) {
      const f = w.filter((t) => now - t < 60_000);
      if (f.length === 0) this.ipWindows.delete(ip);
      else this.ipWindows.set(ip, f);
    }
  }
}
