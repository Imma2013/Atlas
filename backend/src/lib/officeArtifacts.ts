import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import officeParser from 'officeparser';

const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
  'your',
  'you',
  'about',
  'into',
  'make',
  'create',
  'presentation',
  'slides',
  'slide',
]);

const sanitizeLine = (line: string) =>
  line
    .replace(/[`*_#>]/g, '')
    .replace(/^\s*[-•]+\s*/, '')
    .replace(/^\s*(title|key points?|speaker notes?)\s*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const stripLowSignalLines = (lines: string[]) =>
  lines.filter((line) => {
    const lower = line.toLowerCase();
    if (!lower) return false;
    if (lower.includes("i don't have specific")) return false;
    if (lower.includes('you may want to')) return false;
    if (lower.includes('no content provided')) return false;
    if (lower === '--') return false;
    return true;
  });

type SlideSection = { title: string; points: string[] };

const buildSlideSections = (title: string, text: string, contentSlides: number): SlideSection[] => {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => sanitizeLine(line))
    .filter(Boolean);

  const lines = stripLowSignalLines(rawLines);
  const sections: SlideSection[] = [];
  let current: SlideSection | undefined;

  lines.forEach((line) => {
    const slideTitle = line.match(/^slide\s*\d+\s*[:\-]?\s*(.+)$/i);
    if (slideTitle?.[1]) {
      if (current?.points.length) sections.push(current);
      current = { title: slideTitle[1].trim().slice(0, 64), points: [] };
      return;
    }

    const explicitTitle = line.match(/^title\s*[:\-]?\s*(.+)$/i);
    if (explicitTitle?.[1]) {
      if (!current) current = { title: explicitTitle[1].trim().slice(0, 64), points: [] };
      else current.title = explicitTitle[1].trim().slice(0, 64);
      return;
    }

    if (!current) current = { title: 'Overview', points: [] };
    current.points.push(line);
  });

  if (current?.points.length) sections.push(current);

  if (sections.length === 0) {
    const fallback = lines.length > 0 ? lines : [title];
    const chunkSize = Math.max(2, Math.ceil(fallback.length / Math.max(1, contentSlides)));
    for (let i = 0; i < fallback.length; i += chunkSize) {
      sections.push({
        title: i === 0 ? 'Overview' : `Topic ${Math.floor(i / chunkSize) + 1}`,
        points: fallback.slice(i, i + chunkSize),
      });
    }
  }

  while (sections.length < contentSlides) {
    sections.push({
      title: `Key Point ${sections.length + 1}`,
      points: ['Core insight', 'Recommended action'],
    });
  }

  return sections.slice(0, contentSlides);
};

const toKeywordQuery = (...parts: string[]) => {
  const tokens = parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  const unique = Array.from(new Set(tokens)).slice(0, 8);
  return unique.join(' ').trim();
};

export const createWorkbookFromText = (input: { text: string; title?: string }) => {
  const lines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);

  const title = (input.title || 'Astro Sheet').trim();
  const rows: string[][] = [
    ['Title', title],
    ['Generated', new Date().toISOString()],
    [],
    ['Section', 'Details'],
    ...(lines.length > 0
      ? lines.map((line, index) => [`Item ${index + 1}`, line])
      : [['Summary', input.text.trim() || 'No content']]),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Atlas');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const createPresentationFromText = async (input: {
  title: string;
  text: string;
  slideCount?: number;
}) => {
  const totalSlides = Math.min(15, Math.max(2, Number(input.slideCount || 6)));
  const contentSlides = totalSlides - 1;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const toDataUri = (buffer: Buffer, mime: string) =>
    `data:${mime};base64,${buffer.toString('base64')}`;

  const loadBackgroundImage = async (query: string) => {
    const safeQuery = toKeywordQuery(query, input.title) || 'business presentation';
    try {
      const wikiSearchUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=6&gsrsearch=${encodeURIComponent(
        `${safeQuery} filetype:bitmap`,
      )}&prop=imageinfo&iiprop=url|mime`;
      const searchRes = await fetch(wikiSearchUrl, { cache: 'no-store' });
      if (!searchRes.ok) return null;

      const searchData = (await searchRes.json()) as {
        query?: {
          pages?: Record<string, { imageinfo?: Array<{ url?: string; mime?: string }> }>;
        };
      };

      const pages = Object.values(searchData.query?.pages || {});
      const pick = pages
        .flatMap((page) => page.imageinfo || [])
        .find((item) => item.url && /^image\//.test(item.mime || ''));

      if (!pick?.url) return null;

      const res = await fetch(pick.url, { cache: 'no-store' });
      if (!res.ok) return null;
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await res.arrayBuffer();
      return toDataUri(Buffer.from(arrayBuffer), mime);
    } catch {
      return null;
    }
  };

  const titleImage = await loadBackgroundImage(`${input.title} hero`);
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: '0B1220' };
  if (titleImage) {
    titleSlide.addImage({ data: titleImage, x: 0, y: 0, w: 13.33, h: 7.5 });
    titleSlide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.33,
      h: 7.5,
      fill: { color: '0B1220', transparency: 38 },
      line: { color: '0B1220', transparency: 100 },
    });
  }
  titleSlide.addText(input.title || 'Atlas Presentation', {
    x: 0.7,
    y: 0.9,
    w: 11.6,
    h: 1.2,
    fontSize: 40,
    bold: true,
    color: 'F8FAFC',
  });
  titleSlide.addText('Generated by Atlas', {
    x: 0.75,
    y: 2.15,
    w: 4.5,
    h: 0.4,
    fontSize: 12,
    color: 'D1D5DB',
  });

  const sections = buildSlideSections(input.title, input.text, contentSlides);

  const palette = ['0F172A', '111827', '1E1B4B', '0C4A6E', '292524'];
  const imageCache = await Promise.all(
    sections.map((section) =>
      loadBackgroundImage(`${input.title} ${section.title} ${section.points.slice(0, 2).join(' ')}`),
    ),
  );

  sections.forEach((section, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: palette[idx % palette.length] };
    const image = imageCache[idx];
    if (image) {
      slide.addImage({ data: image, x: 8.2, y: 0, w: 5.13, h: 7.5 });
      slide.addShape(pptx.ShapeType.rect, {
        x: 8.2,
        y: 0,
        w: 5.13,
        h: 7.5,
        fill: { color: '000000', transparency: 28 },
        line: { color: '000000', transparency: 100 },
      });
    }
    slide.addText(section.title || `Slide ${idx + 2}`, {
      x: 0.7,
      y: 0.45,
      w: 6.9,
      h: 0.6,
      fontSize: 20,
      bold: true,
      color: 'E5E7EB',
    });
    slide.addText(
      section.points.slice(0, 6).map((item) => ({
        text: sanitizeLine(item),
        options: { bullet: { indent: 18 } },
      })),
      {
        x: 0.75,
        y: 1.2,
        w: 6.95,
        h: 5.7,
        fontSize: 17,
        color: 'F8FAFC',
        breakLine: true,
      },
    );
  });

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return buffer;
};

export const extractWorkbookText = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const lines: string[] = [];
  workbook.SheetNames.slice(0, 5).forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });
    lines.push(`# ${sheetName}`);
    rows.slice(0, 200).forEach((row) => {
      const serialized = (row || [])
        .map((cell) => (cell == null ? '' : String(cell)))
        .join(' | ')
        .trim();
      if (serialized) lines.push(serialized);
    });
  });
  return lines.join('\n');
};

export const extractOfficeText = async (buffer: Buffer) => {
  const text = await officeParser.parseOfficeAsync(buffer);
  return String(text || '').trim();
};

export const toCsvFromText = (text: string) =>
  ['Section,Details', `${escapeCsvCell('Summary')},${escapeCsvCell(text.replace(/\r?\n/g, ' '))}`].join('\n');

