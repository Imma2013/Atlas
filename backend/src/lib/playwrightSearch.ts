import { chromium } from 'playwright-core';

export type PlaywrightSearchResult = {
  name: string;
  url: string;
  snippet: string;
  content: string;
};

const CANDIDATE_BROWSER_PATHS = [
  process.env.PLAYWRIGHT_BROWSER_PATH,
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean) as string[];

const isBlockedUrl = (url: string) => {
  const normalized = url.toLowerCase();
  return (
    normalized.includes('google.com/search') ||
    normalized.includes('google.com/url?') ||
    normalized.includes('/preferences') ||
    normalized.includes('/support.google.com') ||
    normalized.includes('webcache.googleusercontent.com')
  );
};

const clip = (value: string, max = 1200) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

export const searchWebWithPlaywright = async (
  query: string,
  maxResults = 5,
): Promise<PlaywrightSearchResult[]> => {
  const launchOptions =
    CANDIDATE_BROWSER_PATHS.length > 0
      ? { headless: true as const, executablePath: CANDIDATE_BROWSER_PATHS[0] }
      : { headless: true as const };

  const browser = await chromium.launch(launchOptions);

  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);

    const candidates = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map((anchor) => {
          const href = (anchor as HTMLAnchorElement).href || '';
          const heading = anchor.querySelector('h3');
          const title = heading?.textContent?.trim() || anchor.textContent?.trim() || '';
          return { href, title };
        })
        .filter((item) => item.href && item.title.length > 0);
    });

    const uniqueUrls = new Set<string>();
    const topResults = candidates
      .filter((item) => item.href.startsWith('http'))
      .filter((item) => !isBlockedUrl(item.href))
      .filter((item) => {
        if (uniqueUrls.has(item.href)) return false;
        uniqueUrls.add(item.href);
        return true;
      })
      .slice(0, Math.max(1, maxResults));

    const enriched: PlaywrightSearchResult[] = [];
    for (const item of topResults) {
      try {
        const detailPage = await browser.newPage();
        await detailPage.goto(item.href, {
          waitUntil: 'domcontentloaded',
          timeout: 25000,
        });
        await detailPage.waitForTimeout(500);
        const extracted = await detailPage.evaluate(() => {
          const title = document.title?.trim() || '';
          const paragraphs = Array.from(document.querySelectorAll('p'))
            .map((p) => p.textContent?.trim() || '')
            .filter(Boolean)
            .slice(0, 12);
          const text = paragraphs.join(' ');
          return { title, text };
        });
        await detailPage.close();

        enriched.push({
          name: clip(extracted.title || item.title, 180),
          url: item.href,
          snippet: clip(extracted.text, 260),
          content: clip(extracted.text, 2800),
        });
      } catch {
        enriched.push({
          name: clip(item.title, 180),
          url: item.href,
          snippet: 'Unable to extract full page content. URL captured from search results.',
          content: '',
        });
      }
    }

    return enriched;
  } finally {
    await browser.close();
  }
};
