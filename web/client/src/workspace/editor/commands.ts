import { EditorSelection, type ChangeSpec, type EditorState, type Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

type Target = Pick<EditorView, 'state' | 'dispatch'>;

/** Wraps / unwraps the selection with an inline marker (`**`, `*`, `~~`, `` ` ``). With no selection, inserts the marker pair around a placeholder. */
export function toggleInline(view: Target, marker: string, placeholder = 'text'): boolean {
  const { state } = view;
  const len = marker.length;
  const tr = state.changeByRange((range) => {
    const before = state.sliceDoc(Math.max(0, range.from - len), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + len));
    if (!range.empty && before === marker && after === marker) {
      return {
        changes: [{ from: range.from - len, to: range.from }, { from: range.to, to: range.to + len }],
        range: EditorSelection.range(range.from - len, range.to - len),
      };
    }

    const selected = state.sliceDoc(range.from, range.to);
    if (!range.empty && selected.length > 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
      return {
        changes: [{ from: range.from, to: range.from + len }, { from: range.to - len, to: range.to }],
        range: EditorSelection.range(range.from, range.to - 2 * len),
      };
    }

    if (range.empty) {
      return {
        changes: { from: range.from, insert: marker + placeholder + marker },
        range: EditorSelection.range(range.from + len, range.from + len + placeholder.length),
      };
    }

    return {
      changes: [{ from: range.from, insert: marker }, { from: range.to, insert: marker }],
      range: EditorSelection.range(range.from + len, range.to + len),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

function selectedLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    // a selection ending at the very start of a line does not include that line
    const endPos = r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to;
    const last = state.doc.lineAt(endPos).number;
    for (let n = first; n <= last; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        lines.push(state.doc.line(n));
      }
    }
  }

  return lines;
}

const HEADING_RE = /^(#{1,6})[ \t]+/;

/** Sets the heading level of the selected lines; applying the same level again removes the heading. */
export function setHeading(view: Target, level: 1 | 2 | 3): boolean {
  const { state } = view;
  const lines = selectedLines(state);
  const allSame = lines.every((l) => HEADING_RE.exec(l.text)?.[1].length === level);
  const changes: ChangeSpec[] = lines.map((l) => {
    const m = HEADING_RE.exec(l.text);
    const from = l.from;
    const to = l.from + (m ? m[0].length : 0);
    return { from, to, insert: allSame ? '' : `${'#'.repeat(level)} ` };
  });
  view.dispatch(state.update({ changes, userEvent: 'input.format', scrollIntoView: true }));
  return true;
}

export type ListKind = 'bullet' | 'number' | 'task' | 'quote';

const PREFIX: Record<ListKind, RegExp> = {
  bullet: /^(\s*)[-*+][ \t]+(?!\[[ xX]\][ \t])/,
  number: /^(\s*)\d+[.)][ \t]+/,
  task: /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/,
  quote: /^(\s*)>[ \t]?/,
};

const ANY_PREFIX = /^(\s*)(?:[-*+][ \t]+\[[ xX]\][ \t]+|[-*+][ \t]+|\d+[.)][ \t]+|>[ \t]?)/;

/** Toggles a list / quote prefix on the selected lines; switching between list kinds replaces the old marker. */
export function toggleLinePrefix(view: Target, kind: ListKind): boolean {
  const { state } = view;
  const lines = selectedLines(state).filter((l, _i, all) => all.length === 1 || l.text.trim() !== '');
  const target = lines.length ? lines : selectedLines(state);
  const allHave = target.every((l) => PREFIX[kind].test(l.text));
  let counter = 1;
  const changes: ChangeSpec[] = target.map((l) => {
    const existing = ANY_PREFIX.exec(l.text);
    const indent = existing ? existing[1] : /^\s*/.exec(l.text)![0];
    const stripTo = l.from + (existing ? existing[0].length : indent.length);
    let insert = '';
    if (!allHave) {
      insert = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : kind === 'quote' ? '> ' : `${counter++}. `;
    }

    return { from: l.from + indent.length, to: stripTo, insert };
  });
  view.dispatch(state.update({ changes, userEvent: 'input.format', scrollIntoView: true }));
  return true;
}

export function insertLink(view: Target): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const selected = state.sliceDoc(range.from, range.to);
    const text = selected || 'link text';
    const insert = `[${text}](https://)`;
    const urlStart = range.from + text.length + 3;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(urlStart, urlStart + 8) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

export function insertCodeBlock(view: Target): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const startLine = state.doc.lineAt(range.from);
    const needsLeadingBreak = startLine.text.slice(0, range.from - startLine.from).trim() !== '';
    const body = state.sliceDoc(range.from, range.to);
    const lead = needsLeadingBreak ? '\n' : '';
    const insert = `${lead}\`\`\`\n${body}\n\`\`\`\n`;
    const cursor = range.from + lead.length + 4;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(cursor, cursor + body.length) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

const TABLE = '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n';

export function insertTable(view: Target): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.to);
    const atLineStart = range.to === line.from;
    const prefix = atLineStart ? '' : '\n\n';
    const from = atLineStart ? range.to : line.to;
    return {
      changes: { from, insert: `${prefix}${TABLE}` },
      range: EditorSelection.range(from + prefix.length + 2, from + prefix.length + 2 + 'Column 1'.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}

export function insertRule(view: Target): boolean {
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.to);
    const insert = line.text.trim() === '' ? '---\n' : '\n\n---\n';
    const from = line.text.trim() === '' ? line.from : line.to;
    return { changes: { from, to: line.text.trim() === '' ? line.to : from, insert }, range: EditorSelection.cursor(from + insert.length) };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input.format' }));
  return true;
}


const EMPTY_TASK_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*$/;

/** lang-markdown keeps continuing an empty "- [ ] " item; pressing Enter on it should end the list instead. */
export function exitEmptyTaskItem(view: Target): boolean {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.to || !EMPTY_TASK_ITEM.test(line.text)) return false;
  view.dispatch(state.update({ changes: { from: line.from, to: line.to, insert: '' }, selection: { anchor: line.from }, userEvent: 'input.format' }));
  return true;
}
