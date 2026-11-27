import { MATCH_END, MATCH_START } from '../../api/types';

export interface SnippetPart { text: string; match: boolean }

/**
 * Splits a server search snippet on the private-use match markers. The result is rendered as React text nodes
 * (never as HTML), so snippets cannot inject markup. Unbalanced or stray markers are dropped.
 */
export function parseSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let match = false;
  let buffer = '';

  const flush = () => {
    if (buffer) {
      parts.push({ text: buffer, match });
      buffer = '';
    }
  };

  for (const ch of snippet) {
    if (ch === MATCH_START) {
      flush();
      match = true;
    } else if (ch === MATCH_END) {
      flush();
      match = false;
    } else {
      buffer += ch;
    }
  }

  flush();
  return parts;
}

/** Plain text of a snippet without markers. */
export function snippetText(snippet: string): string {
  return parseSnippet(snippet).map((p) => p.text).join('');
}

/** First highlighted term of a snippet (used to jump to the match when a hit is opened). */
export function firstMatch(snippet: string): string | null {
  return parseSnippet(snippet).find((p) => p.match)?.text ?? null;
}
