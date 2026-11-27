import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { validateName } from '../lib/names';

interface Props {
  initial: string;
  kind: 'folder' | 'document';
  /** names of the sibling items of the same kind (conflict check, case-insensitive) */
  siblings: readonly string[];
  ariaLabel: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}

/** Inline name editor used for rename (F2) and for creating new items. */
export function InlineName({ initial, kind, siblings, ariaLabel, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.toLowerCase().endsWith('.md') ? initial.length - 3 : initial.length;
    el.setSelectionRange(0, dot);
  }, [initial]);

  const check = (raw: string): string | null => {
    const err = validateName(raw, kind);
    if (err) return err;
    const lower = (kind === 'document' && !/\.md$/i.test(raw.trim()) ? `${raw.trim()}.md` : raw.trim()).toLowerCase();
    if (lower !== initial.toLowerCase() && siblings.some((s) => s.toLowerCase() === lower)) {
      return 'An item with that name already exists here.';
    }

    return null;
  };

  const commit = () => {
    if (finished.current) return;
    const err = check(value);
    if (err) {
      setError(err);
      ref.current?.focus();
      return;
    }

    finished.current = true;
    if (value.trim() === initial) {
      onCancel();
    } else {
      onCommit(value.trim());
    }
  };

  const cancel = () => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <span className="ws-inline-name">
      <input
        ref={ref}
        className="ws-inline-input"
        value={value}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onBlur={() => {
          // leaving the field commits a valid change and silently drops an invalid/empty one
          if (!finished.current && value.trim() && !check(value)) commit();
          else cancel();
        }}
      />
      {error && (
        <span className="ws-inline-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
