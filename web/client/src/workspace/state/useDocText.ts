import { useEffect, useState } from 'react';
import type * as Y from 'yjs';

/** Current content of a Y.Text as a string, updated (trailing-debounced) on every local or remote change. */
export function useDocText(ytext: Y.Text | null, delayMs = 120): string {
  const [text, setText] = useState(() => (ytext ? ytext.toString() : ''));

  useEffect(() => {
    if (!ytext) {
      setText('');
      return;
    }

    setText(ytext.toString());
    let timer: number | undefined;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(ytext.toString()), delayMs);
    };

    ytext.observe(onChange);
    return () => {
      window.clearTimeout(timer);
      ytext.unobserve(onChange);
    };
  }, [ytext, delayMs]);

  return text;
}
