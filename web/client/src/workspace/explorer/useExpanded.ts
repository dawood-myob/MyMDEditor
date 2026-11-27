import { useCallback, useEffect, useState } from 'react';

const key = (userId: string) => `mdhub.explorer.expanded.v1.${userId}`;

function load(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(key(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Expanded folder ids, persisted per user. */
export function useExpanded(userId: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() => load(userId));

  useEffect(() => {
    try {
      localStorage.setItem(key(userId), JSON.stringify([...expanded]));
    } catch {
      /* ignore quota errors */
    }
  }, [expanded, userId]);

  const toggle = useCallback((id: string, force?: boolean) => {
    setExpanded((cur) => {
      const open = force ?? !cur.has(id);
      if (open === cur.has(id)) {
        return cur;
      }

      const next = new Set(cur);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const expandMany = useCallback((ids: readonly string[]) => {
    setExpanded((cur) => (ids.every((i) => cur.has(i)) ? cur : new Set([...cur, ...ids])));
  }, []);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  return { expanded, toggle, expandMany, collapseAll };
}
