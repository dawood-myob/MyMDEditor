import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';

export const HEADING_ID_PREFIX = 'md-';

const SAFE_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);/i;
const HTTP_URL = /^https?:\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Images are limited to http(s), relative URLs and raster data: URIs. */
export function isSafeImageSrc(src: string): boolean {
  const s = src.trim();
  if (SAFE_DATA_IMAGE.test(s)) {
    return true;
  }

  if (HTTP_URL.test(s)) {
    return true;
  }

  return !SCHEME.test(s) && !s.startsWith('//');
}

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
  return slug || 'section';
}

type MarkdownInstance = InstanceType<typeof MarkdownIt>;

function createMarkdown(): MarkdownInstance {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    breaks: false,
    highlight: undefined,
  });

  md.use(taskLists, { enabled: false, label: false });
  md.use(footnote);
  md.use(anchor, { slugify, tabIndex: false });

  // Heading ids get a prefix so they can never clash with application element ids / DOM globals.
  md.core.ruler.push('mdhub_prefix_ids', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'heading_open') {
        const id = String(token.attrGet('id') ?? '');
        if (id && !id.startsWith(HEADING_ID_PREFIX)) {
          token.attrSet('id', HEADING_ID_PREFIX + id);
        }
      }
    }
  });

  // Source line map: every block token with a `map` yields data-line (0-based line of the block start).
  md.core.ruler.push('mdhub_source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.nesting !== -1 && token.level >= 0 && !token.hidden) {
        token.attrSet('data-line', String(token.map[0]));
      }
    }
  });

  md.renderer.rules.fence = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    const info = token.info ? md.utils.unescapeAll(token.info).trim() : '';
    const lang = info.split(/\s+/)[0] ?? '';
    let body: string;
    if (lang && hljs.getLanguage(lang)) {
      try {
        body = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
      } catch {
        body = md.utils.escapeHtml(token.content);
      }
    } else {
      body = md.utils.escapeHtml(token.content);
    }

    const cls = lang ? ` class="hljs language-${md.utils.escapeHtml(lang)}"` : ' class="hljs"';
    const attrs = self.renderAttrs(token);
    void options;
    return `<pre${attrs}><code${cls}>${body}</code></pre>\n`;
  };

  return md;
}

let purifier: ReturnType<typeof DOMPurify> | null = null;

function getPurifier() {
  if (purifier) {
    return purifier;
  }

  const instance = DOMPurify(window);
  instance.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) {
      return;
    }

    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (HTTP_URL.test(href) || href.startsWith('//')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      } else {
        node.removeAttribute('target');
      }
    }

    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src === null || !isSafeImageSrc(src)) {
        node.remove();
      } else {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('referrerpolicy', 'no-referrer');
      }
    }

    if (node.tagName === 'INPUT') {
      node.setAttribute('disabled', '');
    }
  });
  purifier = instance;
  return instance;
}

let mdInstance: MarkdownInstance | null = null;

/** Raw (unsanitised) renderer output. Only exported for tests; use {@link renderMarkdown} everywhere else. */
export function renderUnsafe(source: string): string {
  mdInstance ??= createMarkdown();
  return mdInstance.render(source);
}

/** Markdown -> sanitised HTML string, safe to inject with dangerouslySetInnerHTML / innerHTML. */
export function renderMarkdown(source: string): string {
  return getPurifier().sanitize(renderUnsafe(source), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'script', 'svg', 'math'],
    FORBID_ATTR: ['style', 'srcset'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  });
}
