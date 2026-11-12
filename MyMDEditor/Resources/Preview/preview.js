(function () {
  'use strict';

  const root = document.getElementById('content');
  const MAX_MARKS = 5000;
  const DATA_ATTRS = ['data-sl', 'data-el', 'data-ss', 'data-se'];
  const HOST_KEYS = new Set([
    'ctrl+f', 'ctrl+h', 'f3', 'shift+f3', 'ctrl+p', 'ctrl+shift+p', 'ctrl+s', 'ctrl+shift+s', 'ctrl+o',
    'ctrl+n', 'ctrl+shift+o', 'ctrl+=', 'ctrl++', 'ctrl+-', 'ctrl+0', 'escape', 'f11', 'ctrl+\\'
  ]);

  let blocks = [];
  let findSpec = null;
  let findGen = 0;
  let finding = false;
  let pendingCurrent = null;
  let currentMark = null;
  let syncEl = null;

  const post = (message) => {
    try { window.chrome.webview.postMessage(message); } catch (e) { /* host not attached */ }
  };

  // ---------- Content (incremental DOM patching keeps scroll position and avoids full re-layout) ----------

  const signature = (el) => el.outerHTML.replace(/ data-(?:sl|el|ss|se)="\d+"/g, '');

  function copyDataAttributes(from, to) {
    const fromNodes = [from, ...from.querySelectorAll('[data-sl]')];
    const toNodes = [to, ...to.querySelectorAll('[data-sl]')];
    const n = Math.min(fromNodes.length, toNodes.length);
    for (let i = 0; i < n; i++) {
      for (const attr of DATA_ATTRS) {
        const value = fromNodes[i].getAttribute(attr);
        if (value === null) {
          toNodes[i].removeAttribute(attr);
        } else if (toNodes[i].getAttribute(attr) !== value) {
          toNodes[i].setAttribute(attr, value);
        }
      }
    }
  }

  function applyContent(html) {
    clearSync();

    const template = document.createElement('template');
    template.innerHTML = html;
    const next = [];
    template.content.childNodes.forEach((node) => {
      if (node.nodeType === 1) {
        next.push(node);
      } else if (node.nodeType === 3 && node.nodeValue.trim().length > 0) {
        const span = document.createElement('span');
        span.textContent = node.nodeValue;
        next.push(span);
      }
    });
    for (const node of next) node.__sig = signature(node);

    const current = Array.from(root.children);
    const max = Math.min(current.length, next.length);
    let prefix = 0;
    while (prefix < max && current[prefix].__sig === next[prefix].__sig) prefix++;
    let suffix = 0;
    while (suffix < max - prefix &&
           current[current.length - 1 - suffix].__sig === next[next.length - 1 - suffix].__sig) suffix++;

    for (let i = 0; i < prefix; i++) copyDataAttributes(next[i], current[i]);
    for (let k = 1; k <= suffix; k++) copyDataAttributes(next[next.length - k], current[current.length - k]);

    const anchor = suffix > 0 ? current[current.length - suffix] : null;
    for (let i = prefix; i < current.length - suffix; i++) current[i].remove();

    const inserted = next.slice(prefix, next.length - suffix);
    const fragment = document.createDocumentFragment();
    inserted.forEach((node) => fragment.appendChild(node));
    root.insertBefore(fragment, anchor);

    blocks = Array.from(root.querySelectorAll('[data-sl]'));
    if (findSpec) {
      if (finding) {
        // A previous pass was still in flight; restart so no region is left half-highlighted.
        clearFind();
        highlightNodes(Array.from(root.children));
      } else if (inserted.length > 0) {
        highlightNodes(inserted);
      }
    }
  }

  // ---------- Search highlighting (chunked so large documents never block the UI) ----------

  function buildRegex(spec) {
    const flags = 'gm' + (spec.caseSensitive ? '' : 'i');
    try { return new RegExp(spec.pattern, flags + 'u'); } catch (e) { /* fall back to non-unicode mode */ }
    try { return new RegExp(spec.pattern, flags); } catch (e) { return null; }
  }

  function clearFind() {
    findGen++;
    finding = false;
    currentMark = null;
    const parents = new Set();
    root.querySelectorAll('mark.mde-find').forEach((mark) => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parents.add(parent);
    });
    parents.forEach((p) => p.normalize());
  }

  function collectTextNodes(nodes) {
    const result = [];
    for (const node of nodes) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
        acceptNode: (t) => t.parentNode && t.parentNode.closest && t.parentNode.closest('mark.mde-find')
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
      });
      let t;
      while ((t = walker.nextNode())) result.push(t);
    }
    return result;
  }

  function wrapMatches(node, regex, state) {
    const text = node.nodeValue;
    regex.lastIndex = 0;
    let fragment = null;
    let last = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      if (m[0].length === 0) { regex.lastIndex++; continue; }
      if (state.count >= MAX_MARKS) break;
      fragment = fragment || document.createDocumentFragment();
      if (m.index > last) fragment.append(text.slice(last, m.index));
      const mark = document.createElement('mark');
      mark.className = 'mde-find';
      mark.textContent = m[0];
      fragment.append(mark);
      last = m.index + m[0].length;
      state.count++;
    }
    if (fragment) {
      if (last < text.length) fragment.append(text.slice(last));
      node.parentNode.replaceChild(fragment, node);
    }
  }

  function highlightNodes(nodes) {
    const regex = findSpec && buildRegex(findSpec);
    if (!regex) return;

    const gen = ++findGen;
    const textNodes = collectTextNodes(nodes);
    const state = { count: root.querySelectorAll('mark.mde-find').length };
    let index = 0;
    finding = true;

    const step = () => {
      if (gen !== findGen) return;
      const deadline = performance.now() + 10;
      while (index < textNodes.length && performance.now() < deadline) {
        const node = textNodes[index++];
        if (node.isConnected) wrapMatches(node, regex, state);
        if (state.count >= MAX_MARKS) { index = textNodes.length; }
      }
      if (index < textNodes.length) {
        setTimeout(step, 0);
      } else {
        finding = false;
        applyCurrent();
      }
    };
    step();
  }

  function setFind(spec) {
    clearFind();
    findSpec = spec && spec.pattern ? spec : null;
    if (findSpec) highlightNodes(Array.from(root.children));
  }

  // ---------- Block lookup / editor -> preview sync ----------

  function blockForLine(line) {
    let best = null;
    let bestSpan = Infinity;
    for (const el of blocks) {
      const start = +el.getAttribute('data-sl');
      if (start > line) break;
      const end = +el.getAttribute('data-el');
      if (end >= line && end - start <= bestSpan) {
        best = el;
        bestSpan = end - start;
      }
    }
    // Markdig attaches fenced-code attributes to <code>; highlight the enclosing <pre> instead.
    if (best && best.tagName === 'CODE' && best.parentElement && best.parentElement.tagName === 'PRE') {
      return best.parentElement;
    }
    return best;
  }

  function ensureVisible(el) {
    const rect = el.getBoundingClientRect();
    const height = window.innerHeight;
    const margin = Math.min(80, height / 6);
    const fits = rect.height <= height - margin * 2;
    const visible = rect.top >= margin && rect.bottom <= height - margin;
    if (visible) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    el.scrollIntoView({ block: fits ? 'center' : 'start', behavior });
  }

  function clearSync() {
    if (syncEl) syncEl.classList.remove('mde-sync', 'mde-flash');
    syncEl = null;
  }

  function syncLine(line, scroll, flash) {
    const el = blockForLine(line);
    if (!el) return;
    if (el !== syncEl) {
      clearSync();
      el.classList.add('mde-sync');
      syncEl = el;
    }
    if (flash) {
      el.classList.remove('mde-flash');
      void el.offsetWidth;
      el.classList.add('mde-flash');
    }
    if (scroll) ensureVisible(el);
  }

  function applyCurrent() {
    const p = pendingCurrent;
    if (!p) return;
    pendingCurrent = null;
    if (currentMark) currentMark.classList.remove('current');
    currentMark = null;

    const block = blockForLine(p.line);
    let target = null;
    if (block) {
      const marks = block.querySelectorAll('mark.mde-find');
      if (marks.length > 0) target = marks[Math.min(Math.max(p.ordinal, 0), marks.length - 1)];
    }
    if (target) {
      target.classList.add('current');
      currentMark = target;
      if (p.scroll) ensureVisible(target);
    } else if (block && p.scroll) {
      ensureVisible(block);
    }
  }

  function setCurrent(line, ordinal, scroll) {
    pendingCurrent = { line, ordinal, scroll };
    if (!finding) applyCurrent();
  }

  // ---------- Preview -> editor sync ----------

  const blockOf = (node) => {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return el ? el.closest('[data-sl]') : null;
  };

  function describe(first, last, text, tag, collapsed) {
    return {
      type: 'select',
      sl: +first.getAttribute('data-sl'),
      el: +last.getAttribute('data-el'),
      ss: +first.getAttribute('data-ss'),
      se: +last.getAttribute('data-se'),
      text: text.length > 500 ? text.slice(0, 500) : text,
      tag,
      collapsed
    };
  }

  let selectionTimer = 0;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const text = selection.toString();
      if (!text.trim()) return;
      const range = selection.getRangeAt(0);
      const first = blockOf(range.startContainer);
      const last = blockOf(range.endContainer) || first;
      if (first) post(describe(first, last, text, first.tagName, false));
    }, 200);
  });

  root.addEventListener('click', (e) => {
    const anchor = e.target.closest && e.target.closest('a[href]');
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('#')) {
        const target = document.getElementById(decodeURIComponent(href.slice(1)));
        if (target) target.scrollIntoView();
      } else {
        post({ type: 'link', href, resolved: anchor.href });
      }
      return;
    }

    const selection = document.getSelection();
    if (selection && !selection.isCollapsed) return;
    const block = blockOf(e.target);
    if (!block) return;
    const img = e.target.closest && e.target.closest('img');
    post(describe(block, block, img ? (img.getAttribute('alt') || img.getAttribute('src') || '') : '', block.tagName, true));
  });

  // ---------- Keyboard: forward app-level shortcuts to the host ----------

  document.addEventListener('keydown', (e) => {
    let key = e.key.toLowerCase();
    if (key === ' ') key = 'space';
    const combo = (e.ctrlKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey ? 'shift+' : '') + key;
    if (HOST_KEYS.has(combo)) {
      e.preventDefault();
      post({ type: 'key', combo });
    }
  }, true);

  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('a[href]')) e.preventDefault();
  });

  // ---------- Host messages ----------

  window.chrome.webview.addEventListener('message', (event) => {
    const m = event.data;
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'content':
        if (typeof m.baseHref === 'string') document.getElementById('docBase').setAttribute('href', m.baseHref);
        applyContent(m.html || '');
        break;
      case 'theme':
        document.documentElement.setAttribute('data-theme', m.theme);
        break;
      case 'find':
        setFind(m.spec);
        break;
      case 'current':
        setCurrent(m.line, m.ordinal, m.scroll !== false);
        break;
      case 'sync':
        syncLine(m.line, m.scroll !== false, m.flash === true);
        break;
      default:
        break;
    }
  });

  post({ type: 'ready' });
})();
