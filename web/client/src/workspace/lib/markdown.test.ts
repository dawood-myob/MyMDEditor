import { describe, expect, it } from 'vitest';
import { isSafeImageSrc, renderMarkdown } from './markdown';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('renderMarkdown', () => {
  it('renders headings with prefixed ids and data-line', () => {
    const html = renderMarkdown('# Hello World\n\ntext');
    expect(html).toContain('id="md-hello-world"');
    expect(html).toMatch(/<h1[^>]*data-line="0"/);
    expect(html).toMatch(/<p[^>]*data-line="2"/);
  });

  it('escapes raw HTML (html:false) instead of rendering it', () => {
    const html = renderMarkdown('<div onclick="x()">hi</div> <b>bold</b>');
    expect(html).not.toContain('<div');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;div');
  });

  it('strips <script>', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nok');
    expect(html).not.toContain('<script');
    expect(html).toContain('ok');
  });

  it('drops javascript: links', () => {
    const html = renderMarkdown('[x](javascript:alert(1)) [y](JaVaScRiPt:alert(1)) [z](vbscript:x)');
    const doc = parse(html);
    expect(doc.querySelectorAll('a').length).toBe(0);
    expect(doc.querySelectorAll('[href]').length).toBe(0);
  });

  it('does not allow onerror handlers', () => {
    const html = renderMarkdown('![x](x.png "t\\" onerror=\\"alert(1)") <img src=x onerror=alert(1)>');
    const doc = parse(html);
    expect(doc.querySelectorAll('[onerror]').length).toBe(0);
    expect(doc.querySelectorAll('img').length).toBe(1);
  });

  it('opens external links in a new tab safely and keeps relative links', () => {
    const html = renderMarkdown('[a](https://example.com) [b](other.md) [c](#sec)');
    expect(html).toMatch(/<a[^>]*href="https:\/\/example.com"[^>]*target="_blank"/);
    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).toMatch(/<a[^>]*href="other.md"(?![^>]*target)/);
  });

  it('allows safe images only', () => {
    const ok = renderMarkdown('![a](https://x.test/a.png) ![b](img/b.png)');
    expect(ok).toContain('src="https://x.test/a.png"');
    expect(ok).toContain('src="img/b.png"');
    const bad = renderMarkdown('![a](file:///etc/passwd) ![b](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)');
    expect(parse(bad).querySelectorAll('img').length).toBe(0);
  });

  it('renders task lists, tables, footnotes and highlighted code', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nnote[^1]\n\n[^1]: foot\n\n```js\nconst a = 1;\n```');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<table');
    expect(html).toContain('footnote');
    expect(html).toContain('hljs-keyword');
  });

  it('escapes code content for unknown languages', () => {
    const html = renderMarkdown('```zzz\n<script>x</script>\n```');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('isSafeImageSrc', () => {
  it('accepts http(s), relative and raster data URIs', () => {
    expect(isSafeImageSrc('https://a/b.png')).toBe(true);
    expect(isSafeImageSrc('a/b.png')).toBe(true);
    expect(isSafeImageSrc('../b.png')).toBe(true);
    expect(isSafeImageSrc('data:image/png;base64,AAAA')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isSafeImageSrc('javascript:alert(1)')).toBe(false);
    expect(isSafeImageSrc('file:///x')).toBe(false);
    expect(isSafeImageSrc('//evil.test/x.png')).toBe(false);
    expect(isSafeImageSrc('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isSafeImageSrc('data:text/html,<script>')).toBe(false);
  });
});
