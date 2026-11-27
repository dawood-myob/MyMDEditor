import fs from 'node:fs';
import { errors } from '../../lib/errors.js';

const CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export function findChromium(configured: string | null): string | null {
  if (configured) return fs.existsSync(configured) ? configured : null;
  if (process.env.LOCALAPPDATA) {
    const local = `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`;
    if (fs.existsSync(local)) return local;
  }
  return CANDIDATES.find((c) => fs.existsSync(c)) ?? null;
}

let active = 0;
const MAX_CONCURRENT = 2;

/** Renders HTML to PDF with headless Chromium. JavaScript and all network access are disabled. */
export async function renderPdf(html: string, opts: { executablePath: string | null; noSandbox: boolean }): Promise<Buffer> {
  const executablePath = findChromium(opts.executablePath);
  if (!executablePath) throw errors.exportUnavailable('PDF export requires Chromium (set CHROMIUM_PATH)');
  if (active >= MAX_CONCURRENT) throw errors.rateLimited(5);
  active++;
  let browser: import('puppeteer-core').Browser | null = null;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    const args = ['--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-extensions'];
    if (opts.noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
    try {
      browser = await puppeteer.launch({ executablePath, headless: true, args, timeout: 20_000 });
    } catch {
      throw errors.exportUnavailable('Chromium could not be started');
    }
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('about:')) void req.continue();
      else void req.abort();
    });
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }, timeout: 45_000 });
    return Buffer.from(pdf);
  } finally {
    active--;
    if (browser) await browser.close().catch(() => undefined);
  }
}
