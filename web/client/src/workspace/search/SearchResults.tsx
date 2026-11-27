import { useId } from 'react';
import type { SearchHit } from '../../api/types';
import { parseSnippet } from '../lib/snippet';
import { IconFile } from '../ui/icons';

interface ViewProps {
  results: readonly SearchHit[];
  query: string;
  loading: boolean;
  error: string | null;
  activeIndex: number;
  listId: string;
  onOpen: (hit: SearchHit) => void;
  onHover?: (index: number) => void;
}

/** Highlighted snippet rendered as React text nodes only (no HTML injection). */
export function Snippet({ text }: { text: string }) {
  return (
    <span className="ws-snippet">
      {parseSnippet(text).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </span>
  );
}

export function optionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`;
}

export function SearchResultsView({ results, query, loading, error, activeIndex, listId, onOpen, onHover }: ViewProps) {
  const statusId = useId();
  if (error) {
    return (
      <div className="ws-search-status" role="alert">
        {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="ws-search-status" role="status" id={statusId}>
        {loading ? 'Searching…' : `No results for “${query}”`}
      </div>
    );
  }

  return (
    <ul className="ws-search-list" role="listbox" id={listId} aria-label="Search results">
      {results.map((hit, i) => (
        <li
          key={hit.documentId}
          id={optionId(listId, i)}
          role="option"
          aria-selected={i === activeIndex}
          className={`ws-search-item${i === activeIndex ? ' is-active' : ''}`}
          data-testid="search-result"
          // mouse down (not click) so the input does not lose focus/close the popup before the selection registers
          onMouseDown={(e) => {
            e.preventDefault();
            onOpen(hit);
          }}
          onMouseMove={() => onHover?.(i)}
        >
          <div className="ws-search-title">
            <IconFile size={14} />
            <strong>{hit.name}</strong>
            <span className="muted ws-search-path">{hit.path}</span>
          </div>
          <div className="ws-search-snippet">
            <Snippet text={hit.snippet} />
          </div>
        </li>
      ))}
    </ul>
  );
}
