import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let cssCache: string | null = null;

function exportCss(): string {
  if (cssCache === null) {
    const candidates = [path.join(here, '..', '..', 'assets', 'export.css'), path.join(here, '..', '..', '..', 'src', 'assets', 'export.css')];
    const file = candidates.find((c) => fs.existsSync(c));
    cssCache = file ? fs.readFileSync(file, 'utf8') : 'body{font-family:sans-serif;max-width:860px;margin:2em auto}';
  }
  return cssCache;
}

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

type MD = InstanceType<typeof MarkdownIt>;

function create(kind: 'html' | 'docx'): MD {
  const md: MD = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: false,
    highlight(str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs"><code class="language-${escapeHtml(lang)}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
        } catch {
          /* fall through to the default escaping */
        }
      }
      return '';
    },
  });
  md.use(anchor, { slugify: (s: string) => encodeURIComponent(s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')) });
  md.use(footnote);
  md.use(taskLists, { enabled: false });
  if (kind === 'docx') {
    // html-to-docx would fetch remote images itself (SSRF); only embedded raster images are kept.
    const original = md.renderer.rules.image!;
    md.renderer.rules.image = (tokens, idx, options, env, self) => {
      const tok = tokens[idx]!;
      const src = String(tok.attrGet('src') ?? '');
      if (/^data:image\/(png|jpe?g|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) return original(tokens, idx, options, env, self);
      return `<em>[image: ${escapeHtml(tok.content || 'image')}]</em>`;
    };
  }
  return md;
}

const htmlMd = create('html');
const docxMd = create('docx');

export const renderMarkdown = (src: string): string => htmlMd.render(src);
export const renderMarkdownForDocx = (src: string): string => docxMd.render(src);

/** Self-contained styled page. Remote images are only allowed for the browser variant (not for PDF). */
export function buildHtmlPage(title: string, body: string, opts: { allowRemoteImages: boolean }): string {
  const img = opts.allowRemoteImages ? "img-src data: https: http:" : 'img-src data:';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${img}; style-src 'unsafe-inline'; font-src data:">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${exportCss()}</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
</body>
</html>
`;
}
