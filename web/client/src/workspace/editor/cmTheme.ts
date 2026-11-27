import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export const MONO_STACK = "'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace";

/** Structure/colours come from CSS variables (see workspace.css) so light/dark switches need no reconfiguration. */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'var(--editor-bg)',
    fontSize: 'var(--ws-editor-font-size, 14px)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: MONO_STACK,
    lineHeight: '1.65',
    overflow: 'auto',
  },
  '.cm-content': { padding: '14px 0 40vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 16px 0 10px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--editor-selection) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--editor-selection) !important' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--muted)',
    border: 'none',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px', minWidth: '34px', fontSize: '0.86em' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--editor-active-line)', color: 'var(--text)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
  '.cm-searchMatch': { backgroundColor: 'var(--mark)', outline: '1px solid var(--warning)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--accent-soft)', outline: '2px solid var(--accent)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--accent-soft)' },
  '.cm-panels': { backgroundColor: 'var(--surface-alt)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-tooltip': { backgroundColor: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' },
});

const style = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--ws-syn-heading)', fontWeight: '700', fontSize: '1.28em' },
  { tag: t.heading2, color: 'var(--ws-syn-heading)', fontWeight: '700', fontSize: '1.18em' },
  { tag: t.heading3, color: 'var(--ws-syn-heading)', fontWeight: '700', fontSize: '1.08em' },
  { tag: [t.heading4, t.heading5, t.heading6], color: 'var(--ws-syn-heading)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--muted)' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--link)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--ws-syn-code)' },
  { tag: t.quote, color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--ws-syn-mark)' },
  { tag: t.list, color: 'var(--ws-syn-mark)' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--ws-syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--ws-syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--ws-syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--muted)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--ws-syn-func)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--ws-syn-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--ws-syn-prop)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--ws-syn-keyword)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

export const highlightExtension = syntaxHighlighting(style);
