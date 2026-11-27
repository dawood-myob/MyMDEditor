import { DatabaseSync, type StatementSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type Param = SQLInputValue;

/** Thin wrapper around node:sqlite with a prepared statement cache and nested transactions. */
export class Db {
  readonly raw: DatabaseSync;
  private cache = new Map<string, StatementSync>();
  private depth = 0;

  constructor(file: string) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA foreign_keys = ON');
    this.raw.exec('PRAGMA busy_timeout = 5000');
    if (file !== ':memory:') {
      this.raw.exec('PRAGMA journal_mode = WAL');
      this.raw.exec('PRAGMA synchronous = NORMAL');
    }
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  get<T = Record<string, unknown>>(sql: string, ...params: Param[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, ...params: Param[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }

  run(sql: string, ...params: Param[]): { changes: number } {
    const r = this.stmt(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /** Runs fn inside BEGIN IMMEDIATE/COMMIT (SAVEPOINT when nested). Rolls back on throw. */
  tx<T>(fn: () => T): T {
    if (this.depth === 0) {
      this.raw.exec('BEGIN IMMEDIATE');
      this.depth++;
      try {
        const r = fn();
        this.raw.exec('COMMIT');
        return r;
      } catch (e) {
        this.raw.exec('ROLLBACK');
        throw e;
      } finally {
        this.depth--;
      }
    }
    const name = `sp_${this.depth}`;
    this.raw.exec(`SAVEPOINT ${name}`);
    this.depth++;
    try {
      const r = fn();
      this.raw.exec(`RELEASE ${name}`);
      return r;
    } catch (e) {
      this.raw.exec(`ROLLBACK TO ${name}`);
      this.raw.exec(`RELEASE ${name}`);
      throw e;
    } finally {
      this.depth--;
    }
  }

  close(): void {
    this.cache.clear();
    if (this.raw.isOpen) {
      try {
        this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } catch {
        /* ignore */
      }
      this.raw.close();
    }
  }
}

export function openDatabase(file: string): Db {
  return new Db(file);
}
