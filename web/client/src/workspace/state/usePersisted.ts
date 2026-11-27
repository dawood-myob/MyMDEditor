import { useCallback, useState } from 'react';

function read<T>(key: string, fallback: T, parse: (raw: unknown) => T | null): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** useState that mirrors its value to localStorage; `parse` validates stored data (return null to fall back). */
export function usePersisted<T>(key: string, fallback: T, parse: (raw: unknown) => T | null): [T, (v: T | ((cur: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback, parse));
  const set = useCallback(
    (v: T | ((cur: T) => T)) => {
      setValue((cur) => {
        const next = typeof v === 'function' ? (v as (c: T) => T)(cur) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore quota errors */
        }

        return next;
      });
    },
    [key],
  );
  return [value, set];
}

export const parseBool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
export const parseNumberIn = (min: number, max: number) => (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
