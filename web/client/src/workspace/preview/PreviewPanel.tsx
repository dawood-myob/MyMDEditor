import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { resolveRelativePath } from '../lib/paths';
import { HEADING_ID_PREFIX, renderMarkdown } from '../lib/markdown';
import { collectAnchors, lineOfElement, lineToTop, topToLine, type LineAnchor } from '../lib/scrollmap';
import { LoopGuard } from '../state/bus';
import { useDocText } from '../state/useDocText';
import { useWorkspace } from '../state/WorkspaceContext';
import { IconEye } from '../ui/icons';

const RENDER_DEBOUNCE_MS = 120;

export default function PreviewPanel() {
  const ws = useWorkspace();
  const { bus, collab, documentId, currentDoc, tree } = ws;
  const text = useDocText(collab.session?.ytext ?? null, RENDER_DEBOUNCE_MS);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const anchors = useRef<LineAnchor[]>([]);
  const anchorsDirty = useRef(true);
  const guard = useRef(new LoopGuard());
  const lastEditorLine = useRef(0);
  const [rendered, setRendered] = useState('');
  const loading = !!documentId && !collab.synced && !text && collab.closed === null;
  const empty = !!documentId && collab.synced && text.trim() === '';

  const getAnchors = useCallback(() => {
    if (anchorsDirty.current && scroller.current) {
      anchors.current = collectAnchors(scroller.current);
      anchorsDirty.current = false;
    }

    return anchors.current;
  }, []);

  useEffect(() => {
    setRendered(text ? renderMarkdown(text) : '');
  }, [text]);

  // Keep the scroll position tied to the editor's top line when the content is re-rendered.
  useLayoutEffect(() => {
    if (content.current) {
      content.current.innerHTML = rendered;
      anchorsDirty.current = true;
      if (scroller.current && rendered) {
        guard.current.arm();
        scroller.current.scrollTop = lineToTop(getAnchors(), lastEditorLine.current);
      }
    }
  }, [rendered, getAnchors]);

  // Layout changes (panel resize, images loading, fonts) invalidate the line map.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      anchorsDirty.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const offScroll = bus.on('editor-scroll', (line) => {
      lastEditorLine.current = line;
      const el = scroller.current;
      if (!el || !rendered) return;
      guard.current.arm();
      el.scrollTop = lineToTop(getAnchors(), line);
    });
    const offReveal = bus.on('reveal', ({ line, from }) => {
      lastEditorLine.current = line;
      if (from === 'preview') return;
      const el = scroller.current;
      if (!el) return;
      guard.current.arm();
      el.scrollTop = Math.max(0, lineToTop(getAnchors(), line) - 8);
      const blocks = Array.from(el.querySelectorAll<HTMLElement>('[data-line]'));
      const target = [...blocks].reverse().find((b) => Number(b.dataset.line) <= line);
      if (target) {
        target.classList.remove('mdhub-flash');
        void target.offsetWidth;
        target.classList.add('mdhub-flash');
        window.setTimeout(() => target.classList.remove('mdhub-flash'), 1200);
      }
    });
    const offRelayout = bus.on('relayout', () => {
      anchorsDirty.current = true;
    });
    return () => {
      offScroll();
      offReveal();
      offRelayout();
    };
  }, [bus, rendered, getAnchors]);

  const onScroll = () => {
    if (guard.current.active || !scroller.current) return;
    const line = topToLine(getAnchors(), scroller.current.scrollTop);
    lastEditorLine.current = line;
    bus.emit('preview-scroll', line);
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (link) {
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#')) {
        e.preventDefault();
        const id = decodeURIComponent(href.slice(1));
        const el = content.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"], [id="${CSS.escape(HEADING_ID_PREFIX + id)}"]`);
        el?.scrollIntoView({ block: 'start' });
        return;
      }

      if (!/^(https?:|mailto:|tel:)/i.test(href)) {
        e.preventDefault();
        const resolved = currentDoc ? resolveRelativePath(currentDoc.path, href) : null;
        if (resolved) {
          const hit = [...tree.model.documents.values()].find((d) => d.path.toLowerCase() === resolved.toLowerCase());
          if (hit) ws.openDocument(hit.id);
        }
      }

      return;
    }

    const line = lineOfElement(target);
    if (line !== null && window.getSelection()?.isCollapsed !== false) {
      bus.emit('reveal', { line, from: 'preview' });
    }
  };

  if (!documentId) {
    return (
      <div className="ws-empty">
        <IconEye size={28} />
        <p className="ws-empty-title">Nothing to preview</p>
        <p className="muted">Open a document from the Explorer to see it rendered here.</p>
      </div>
    );
  }

  return (
    <div className="ws-preview" data-testid="preview">
      <div ref={scroller} className="ws-preview-scroll" onScroll={onScroll} tabIndex={0} aria-label="Rendered preview" role="document">
        {loading && (
          <div className="ws-skeleton" aria-busy="true">
            {[40, 90, 75, 85, 60].map((w, i) => (
              <div key={i} className="ws-skeleton-row" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {empty && (
          <div className="ws-empty">
            <IconEye size={28} />
            <p className="ws-empty-title">This document is empty</p>
            <p className="muted">Start typing in the editor and the preview appears here.</p>
          </div>
        )}
        <div ref={content} className="mdhub-preview" onClick={onClick} />
      </div>
    </div>
  );
}
