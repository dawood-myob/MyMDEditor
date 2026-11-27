import { defaultKeymap, indentLess, indentMore } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { closeSearchPanel, highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { useTheme } from '../../app/theme';
import { countWords } from '../lib/format';
import { LoopGuard } from '../state/bus';
import { parseBool, parseNumberIn, usePersisted } from '../state/usePersisted';
import { usePresence, useSaveState } from '../state/useCollab';
import { useWorkspace } from '../state/WorkspaceContext';
import { uniqueName } from '../lib/names';
import { IconCloudOff, IconCheck, IconEdit, IconFilePlus } from '../ui/icons';
import { editorTheme, highlightExtension } from './cmTheme';
import { exitEmptyTaskItem, insertCodeBlock, insertLink, insertRule, insertTable, setHeading, toggleInline, toggleLinePrefix } from './commands';
import { PresenceAvatars } from './PresenceAvatars';
import { EditorToolbar, type ToolbarAction } from './EditorToolbar';

const MIN_FONT = 10;
const MAX_FONT = 28;

const formatKeymap = keymap.of([
  { key: 'Mod-b', run: (v) => toggleInline(v, '**', 'bold text') },
  { key: 'Mod-i', run: (v) => toggleInline(v, '*', 'italic text') },
  { key: 'Mod-Shift-x', run: (v) => toggleInline(v, '~~', 'text') },
  { key: 'Mod-e', run: (v) => toggleInline(v, '`', 'code') },
  { key: 'Mod-k', run: insertLink },
  { key: 'Mod-Alt-1', run: (v) => setHeading(v, 1) },
  { key: 'Mod-Alt-2', run: (v) => setHeading(v, 2) },
  { key: 'Mod-Alt-3', run: (v) => setHeading(v, 3) },
  { key: 'Tab', run: indentMore, shift: indentLess },
]);

interface Pos { line: number; col: number; selected: number }

export default function EditorPanel() {
  const ws = useWorkspace();
  const { collab, bus, user, documentId, canEdit } = ws;
  const { session, status, everSynced, closed, readOnly } = collab;
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const guard = useRef(new LoopGuard());
  const comps = useRef({ editable: new Compartment(), wrap: new Compartment(), dark: new Compartment() });
  const [fontSize, setFontSize] = usePersisted('mdhub.editor.fontSize', 14, parseNumberIn(MIN_FONT, MAX_FONT));
  const [wrap, setWrap] = usePersisted('mdhub.editor.wrap', true, parseBool);
  const [pos, setPos] = useState<Pos>({ line: 1, col: 1, selected: 0 });
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [undo, setUndo] = useState({ canUndo: false, canRedo: false });
  const people = usePresence(session?.awareness ?? null, user.id);
  const saveState = useSaveState(session, status);

  // typing is only allowed after the first sync: the server seeds the text, clients must never insert into an empty doc first
  const locked = readOnly || !everSynced;
  const latest = useRef({ locked, wrap, theme });
  latest.current = { locked, wrap, theme };
  const syncedRef = useRef(false);
  syncedRef.current = everSynced;

  // Jump to the first occurrence of the search term after opening a document from a search hit.
  const runPendingFind = useCallback(() => {
    const req = bus.pendingFind;
    const view = viewRef.current;
    if (!req || !view || !syncedRef.current || req.documentId !== sessionIdRef.current) return;
    bus.pendingFind = null;
    const idx = view.state.doc.toString().toLowerCase().indexOf(req.term.toLowerCase());
    if (idx < 0) return;
    guard.current.arm();
    view.dispatch({
      selection: { anchor: idx, head: idx + req.term.length },
      effects: EditorView.scrollIntoView(idx, { y: 'center' }),
    });
    bus.emit('reveal', { line: view.state.doc.lineAt(idx).number - 1, from: 'external' });
  }, [bus]);
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = session?.documentId ?? null;

  useEffect(() => {
    const host = hostRef.current;
    if (!session || !host) return;
    const { ytext, awareness, undoManager } = session;
    let countsTimer: number | undefined;
    let lastLine = -1;

    const updateCounts = (text: string) => setCounts({ words: countWords(text), chars: text.length });

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: ytext.toString(),
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          EditorState.allowMultipleSelections.of(true),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          highlightExtension,
          editorTheme,
          comps.current.dark.of(EditorView.theme({}, { dark: latest.current.theme === 'dark' })),
          comps.current.wrap.of(latest.current.wrap ? EditorView.lineWrapping : []),
          comps.current.editable.of([EditorState.readOnly.of(latest.current.locked), EditorView.editable.of(!latest.current.locked)]),
          search({ top: true }),
          highlightSelectionMatches(),
          Prec.highest(keymap.of([{ key: 'Enter', run: exitEmptyTaskItem }])),
          formatKeymap,
          keymap.of([...markdownKeymap, ...yUndoManagerKeymap, ...searchKeymap, ...defaultKeymap]),
          yCollab(ytext, awareness, { undoManager }),
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown editor', 'aria-multiline': 'true' }),
          EditorView.updateListener.of((u) => {
            if (u.selectionSet || u.docChanged) {
              const head = u.state.selection.main.head;
              const line = u.state.doc.lineAt(head);
              const sel = u.state.selection.main;
              setPos({ line: line.number, col: head - line.from + 1, selected: Math.abs(sel.to - sel.from) });
              if (line.number - 1 !== lastLine) {
                lastLine = line.number - 1;
                bus.emit('cursor', lastLine);
              }
            }

            if (u.docChanged) {
              window.clearTimeout(countsTimer);
              countsTimer = window.setTimeout(() => updateCounts(u.state.doc.toString()), 150);
            }
          }),
          EditorView.domEventHandlers({
            focus: () => {
              if (!latest.current.locked) awareness.setLocalStateField('editing', true);
            },
            blur: () => {
              awareness.setLocalStateField('editing', false);
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    updateCounts(view.state.doc.toString());
    const head = view.state.selection.main.head;
    lastLine = view.state.doc.lineAt(head).number - 1;
    bus.emit('cursor', lastLine);

    const syncUndo = () => setUndo({ canUndo: undoManager.undoStack.length > 0, canRedo: undoManager.redoStack.length > 0 });
    syncUndo();
    undoManager.on('stack-item-added', syncUndo);
    undoManager.on('stack-item-popped', syncUndo);
    undoManager.on('stack-cleared', syncUndo);

    const topLine = (): number => {
      const top = Math.max(0, view.scrollDOM.scrollTop - view.documentPadding.top);
      const block = view.lineBlockAtHeight(top);
      const lineNo = view.state.doc.lineAt(block.from).number - 1;
      return lineNo + (block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0);
    };

    const onScroll = () => {
      if (!guard.current.active) bus.emit('editor-scroll', topLine());
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

    const offPreviewScroll = bus.on('preview-scroll', (line) => {
      const total = view.state.doc.lines;
      const whole = Math.min(total - 1, Math.max(0, Math.floor(line)));
      const frac = line - Math.floor(line);
      const block = view.lineBlockAt(view.state.doc.line(whole + 1).from);
      guard.current.arm();
      view.scrollDOM.scrollTop = block.top + view.documentPadding.top + frac * block.height;
    });

    const offReveal = bus.on('reveal', ({ line, from }) => {
      if (from === 'external') return;
      const ln = Math.min(view.state.doc.lines, Math.max(1, Math.floor(line) + 1));
      const at = view.state.doc.line(ln).from;
      guard.current.arm();
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: from === 'preview' ? 'nearest' : 'start', yMargin: 12 }),
      });
      if (from !== 'preview') view.focus();
    });
    const offFocus = bus.on('focus-editor', () => {
      view.focus();
      runPendingFind();
    });

    return () => {
      window.clearTimeout(countsTimer);
      offPreviewScroll();
      offReveal();
      offFocus();
      undoManager.off('stack-item-added', syncUndo);
      undoManager.off('stack-item-popped', syncUndo);
      undoManager.off('stack-cleared', syncUndo);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      awareness.setLocalStateField('editing', false);
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
  }, [session, bus, runPendingFind]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: comps.current.editable.reconfigure([EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]),
    });
  }, [locked, session]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.wrap.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap, session]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.current.dark.reconfigure(EditorView.theme({}, { dark: theme === 'dark' })) });
  }, [theme, session]);

  useEffect(() => {
    if (everSynced) runPendingFind();
  }, [everSynced, session, runPendingFind]);

  const act = (a: ToolbarAction) => {
    const view = viewRef.current;
    if (!view) return;
    switch (a) {
      case 'bold': toggleInline(view, '**', 'bold text'); break;
      case 'italic': toggleInline(view, '*', 'italic text'); break;
      case 'strike': toggleInline(view, '~~', 'text'); break;
      case 'code': toggleInline(view, '`', 'code'); break;
      case 'link': insertLink(view); break;
      case 'h1': setHeading(view, 1); break;
      case 'h2': setHeading(view, 2); break;
      case 'h3': setHeading(view, 3); break;
      case 'bullet': toggleLinePrefix(view, 'bullet'); break;
      case 'number': toggleLinePrefix(view, 'number'); break;
      case 'task': toggleLinePrefix(view, 'task'); break;
      case 'quote': toggleLinePrefix(view, 'quote'); break;
      case 'codeblock': insertCodeBlock(view); break;
      case 'table': insertTable(view); break;
      case 'rule': insertRule(view); break;
      case 'undo': session?.undoManager.undo(); break;
      case 'redo': session?.undoManager.redo(); break;
      case 'find': {
        if (!openSearchPanel(view)) closeSearchPanel(view);
        return;
      }
      case 'wrap': setWrap((w) => !w); return;
      case 'zoomIn': setFontSize((s) => Math.min(MAX_FONT, s + 1)); return;
      case 'zoomOut': setFontSize((s) => Math.max(MIN_FONT, s - 1)); return;
    }

    view.focus();
  };

  const style = useMemo(() => ({ '--ws-editor-font-size': `${fontSize}px` }) as React.CSSProperties, [fontSize]);

  if (!documentId) {
    return (
      <div className="ws-empty ws-editor-empty" data-testid="editor-empty">
        <IconEdit size={30} />
        <p className="ws-empty-title">No document open</p>
        <p className="muted">Select a document in the Explorer{canEdit ? ' or create a new one' : ''}.</p>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const names = [...ws.tree.model.documents.values()].filter((d) => d.parentId === null).map((d) => d.name);
              const doc = await ws.tree.actions.createDocument(null, uniqueName('Untitled', names, '.md'));
              if (doc) ws.openDocument(doc.id);
            }}
          >
            <IconFilePlus size={15} /> New document
          </button>
        )}
      </div>
    );
  }

  if (closed === 'deleted') {
    return (
      <div className="ws-empty" role="alert" data-testid="editor-deleted">
        <p className="ws-empty-title">This document was deleted</p>
        <p className="muted">It is no longer available.</p>
        <button type="button" className="btn" onClick={() => ws.openDocument(null)}>
          Back to the workspace
        </button>
      </div>
    );
  }

  const chip =
    status === 'connected'
      ? { cls: 'is-connected', text: 'Connected', title: 'Connected — changes sync in real time' }
      : status === 'connecting'
        ? { cls: 'is-connecting', text: 'Connecting…', title: 'Connecting to the server…' }
        : { cls: 'is-offline', text: 'Offline', title: 'Offline — your changes are kept locally and will sync when the connection is back' };

  return (
    <div className="ws-editor" data-testid="editor" data-readonly={locked ? 'true' : 'false'}>
      <div className="ws-editor-toolbar">
        <EditorToolbar disabled={locked} canUndo={undo.canUndo} canRedo={undo.canRedo} wrap={wrap} onAction={act} />
        <div className="ws-collab">
          <PresenceAvatars people={people} />
          <span className={`ws-chip ${chip.cls}`} role="status" aria-live="polite" title={chip.title} data-testid="connection-chip">
            {status === 'offline' && <IconCloudOff size={13} />}
            {chip.text}
          </span>
          {readOnly ? (
            <span className="ws-chip is-readonly" title="You have view-only access" data-testid="readonly-chip">
              Read-only
            </span>
          ) : (
            <span className={`ws-saved is-${saveState}`} data-testid="save-indicator" aria-live="polite">
              {saveState === 'saved' && <IconCheck size={13} />}
              {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Changes kept locally'}
            </span>
          )}
        </div>
      </div>
      <div className="ws-editor-body">
        <div ref={hostRef} className="ws-editor-host" style={style} data-testid="editor-host" />
        {!everSynced && closed === null && (
          <div className="ws-editor-loading" role="status">
            {status === 'offline' ? 'Cannot reach the server — retrying…' : 'Loading document…'}
          </div>
        )}
      </div>
      <div className="ws-statusbar" aria-label="Editor status">
        <span data-testid="cursor-pos">
          Ln {pos.line}, Col {pos.col}
          {pos.selected > 0 ? ` (${pos.selected} selected)` : ''}
        </span>
        <span>{counts.words.toLocaleString()} words</span>
        <span>{counts.chars.toLocaleString()} characters</span>
        <span className="ws-spacer" />
        <span>{Math.round((fontSize / 14) * 100)}%</span>
        <span>Markdown</span>
      </div>
    </div>
  );
}
