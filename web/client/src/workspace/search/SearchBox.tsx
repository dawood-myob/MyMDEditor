import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client';
import type { SearchHit } from '../../api/types';
import { firstMatch } from '../lib/snippet';
import { describeError } from '../state/useTreeData';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconSearch } from '../ui/icons';
import { optionId, SearchResultsView } from './SearchResults';

const DEBOUNCE_MS = 220;

/** Global search: debounced GET /api/search, keyboard navigable dropdown, Ctrl+K (or "/") focuses it. */
export function SearchBox() {
  const { openDocument } = useWorkspace();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
      if ((mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') || (mod && e.shiftKey && e.key.toLowerCase() === 'f') || (e.key === '/' && !mod && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .get<{ results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=30`)
        .then((r) => {
          if (cancelled) return;
          setResults(r.results);
          setActive(0);
          setError(null);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setResults([]);
            setError(describeError(err));
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (hit: SearchHit) => {
    openDocument(hit.documentId, { find: firstMatch(hit.snippet) ?? query.trim() });
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === 'Escape') {
      if (open || query) {
        e.preventDefault();
        e.stopPropagation();
        if (open) setOpen(false);
        else setQuery('');
      }
    }
  };

  const showPopup = open && query.trim().length > 0;

  return (
    <div className="ws-search" ref={rootRef} role="search">
      <IconSearch size={15} />
      <input
        ref={inputRef}
        type="search"
        className="ws-search-input"
        data-testid="search-input"
        placeholder="Search documents…"
        aria-label="Search documents (Ctrl+K)"
        role="combobox"
        aria-expanded={showPopup}
        aria-controls={showPopup && results.length > 0 ? listId : undefined}
        aria-activedescendant={showPopup && results.length > 0 ? optionId(listId, active) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd className="ws-search-kbd" aria-hidden="true">
        Ctrl K
      </kbd>
      {showPopup && (
        <div className="ws-search-popup card" data-testid="search-popup">
          <SearchResultsView results={results} query={query.trim()} loading={loading} error={error} activeIndex={active} listId={listId} onOpen={choose} onHover={setActive} />
        </div>
      )}
    </div>
  );
}
