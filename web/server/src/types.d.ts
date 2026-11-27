declare module 'html-to-docx' {
  const htmlToDocx: (
    html: string,
    headerHtml?: string | null,
    options?: Record<string, unknown>,
    footerHtml?: string | null,
  ) => Promise<Buffer | ArrayBuffer | Blob>;
  export default htmlToDocx;
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt, options?: { enabled?: boolean; label?: boolean; labelAfter?: boolean }) => void;
  export default plugin;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}
