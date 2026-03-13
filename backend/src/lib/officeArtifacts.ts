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
  const rawLines = input.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 380);

  const title = (input.title || 'Atlas Workbook').trim();
  const workbook = XLSX.utils.book_new();

  const metadataRows: string[][] = [
    ['Title', title],
    ['Generated', new Date().toISOString()],
    ['Source', 'Atlas AI'],
    ['Instructions', input.text.slice(0, 220)],
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadataRows), 'Overview');

  const sourceUrls = Array.from(
    new Set(
      (input.text.match(/https?:\/\/[^\s)]+/g) || [])
        .map((url) => String(url).replace(/[),.;]+$/, '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 24);
  if (sourceUrls.length > 0) {
    const sourceRows = [['Source', 'URL'], ...sourceUrls.map((url, index) => [`Source ${index + 1}`, url])];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sourceRows), 'Sources');
  }

  const extractDelimitedRows = (lines: string[]) => {
    const candidates = [',', '\t', ';']
      .map((delimiter) => ({
        delimiter,
        rows: lines
          .filter((line) => line.includes(delimiter))
          .slice(0, 260)
          .map((line) => line.split(delimiter).map((cell) => sanitizeLine(cell)))
          .filter((row) => row.length >= 2),
      }))
      .filter((entry) => entry.rows.length >= 3);

    if (candidates.length === 0) return null;
    const pick = candidates.sort((a, b) => b.rows.length - a.rows.length)[0];
    const maxCols = Math.max(...pick.rows.map((row) => row.length), 2);
    return pick.rows.map((row) => {
      const next = [...row];
      while (next.length < maxCols) next.push('');
      return next;
    });
  };

  const extractJsonRows = (text: string) => {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
    const candidates = [fenced, text].filter(Boolean) as string[];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => typeof item === 'object')) {
          const columns = Array.from(
            new Set(
              parsed
                .flatMap((item) => Object.keys(item || {}))
                .map((key) => sanitizeLine(String(key)))
                .filter(Boolean),
            ),
          ).slice(0, 24);
          if (columns.length === 0) continue;
          const rows = parsed.slice(0, 260).map((item) =>
            columns.map((column) => {
              const raw = (item as Record<string, unknown>)[column];
              if (raw == null) return '';
              if (typeof raw === 'string') return sanitizeLine(raw);
              return sanitizeLine(JSON.stringify(raw));
            }),
          );
          return [columns, ...rows];
        }
      } catch {
        // no-op
      }
    }
    return null;
  };

  const delimitedRows = extractDelimitedRows(rawLines);
  if (delimitedRows) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(delimitedRows), 'Data');
  }

  const jsonRows = extractJsonRows(input.text);
  if (!delimitedRows && jsonRows) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(jsonRows), 'Data');
  }

  const tableLines = rawLines.filter((line) => line.includes('|'));
  const markdownTableRows = tableLines
    .map((line) =>
      line
        .split('|')
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0),
    )
    .filter((row) => row.length >= 2)
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));

  if (!delimitedRows && !jsonRows && markdownTableRows.length >= 2) {
    const tableRows = markdownTableRows.slice(0, 220);
    const maxCols = Math.max(...tableRows.map((row) => row.length), 2);
    const normalized = tableRows.map((row) => {
      const cloned = [...row];
      while (cloned.length < maxCols) cloned.push('');
      return cloned;
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(normalized), 'Table');
  }

  const kvPairs = rawLines
    .map((line) => {
      const match = line.match(/^([^:]{2,80})\s*:\s*(.+)$/);
      if (!match) return null;
      return [sanitizeLine(match[1]), sanitizeLine(match[2])] as [string, string];
    })
    .filter((pair): pair is [string, string] => Boolean(pair))
    .slice(0, 240);

  if (kvPairs.length > 0 && kvPairs.length <= 220) {
    const kvRows = [['Field', 'Value'], ...kvPairs];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(kvRows), 'Details');
  }

  const listItems = rawLines
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => sanitizeLine(line))
    .filter(Boolean)
    .slice(0, 260);

  if (listItems.length > 0) {
    const listRows = [['Item', 'Notes'], ...listItems.map((item, idx) => [`Item ${idx + 1}`, item])];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(listRows), 'Items');
  }

  const fallbackRows: string[][] = rawLines.slice(0, 220).map((line, idx) => [`Line ${idx + 1}`, line]);
  if (fallbackRows.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([['Label', 'Content'], ...fallbackRows]),
      'Notes',
    );
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const createPresentationFromText = async (input: {
  title: string;
  text: string;
  slideCount?: number;
}) => {
  const parseMarkdownTable = (text: string) => {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes('|'))
      .map((line) =>
        line
          .split('|')
          .map((cell) => sanitizeLine(cell))
          .filter(Boolean),
      )
      .filter((row) => row.length >= 2)
      .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));

    if (rows.length < 2) return null;
    const headers = rows[0].slice(0, 8);
    const body = rows.slice(1, 24).map((row) => {
      const next = [...row];
      while (next.length < headers.length) next.push('');
      return next.slice(0, headers.length);
    });
    return { headers, rows: body };
  };

  const buildChartData = (table: { headers: string[]; rows: string[][] } | null) => {
    if (!table || table.rows.length < 2) return null;
    const numberColumnIndex = table.headers.findIndex((_, idx) =>
      table.rows.some((row) => Number(String(row[idx]).replace(/[^0-9.-]/g, '')) > 0),
    );
    if (numberColumnIndex < 0) return null;

    const labelColumnIndex = numberColumnIndex === 0 ? 1 : 0;
    const labels: string[] = [];
    const values: number[] = [];
    table.rows.forEach((row) => {
      const label = String(row[labelColumnIndex] || '').trim();
      const numeric = Number(String(row[numberColumnIndex] || '').replace(/[^0-9.-]/g, ''));
      if (!label || !Number.isFinite(numeric)) return;
      labels.push(label.slice(0, 40));
      values.push(numeric);
    });

    if (labels.length < 2) return null;
    return {
      labels: labels.slice(0, 8),
      values: values.slice(0, 8),
      metric: table.headers[numberColumnIndex] || 'Value',
    };
  };

  const totalSlides = Math.min(15, Math.max(2, Number(input.slideCount || 6)));
  const contentSlides = totalSlides - 1;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Cryzo Atlas';
  pptx.subject = 'AI-generated presentation';
  pptx.company = 'Cryzo';
  pptx.theme = {
    headFontFace: 'Aptos Display',
    bodyFontFace: 'Aptos',
  };

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
      try {
        const fallback = await fetch(
          `https://source.unsplash.com/1600x900/?${encodeURIComponent(safeQuery)}`,
          { cache: 'no-store' },
        );
        if (!fallback.ok) return null;
        const mime = fallback.headers.get('content-type') || 'image/jpeg';
        const arrayBuffer = await fallback.arrayBuffer();
        return toDataUri(Buffer.from(arrayBuffer), mime);
      } catch {
        return null;
      }
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

  const parsedTable = parseMarkdownTable(input.text);
  const chartData = buildChartData(parsedTable);
  if (chartData) {
    const dataSlide = pptx.addSlide();
    dataSlide.background = { color: '0E1A2B' };
    dataSlide.addText('Data Highlights', {
      x: 0.7,
      y: 0.45,
      w: 7.6,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: 'E5E7EB',
    });
    dataSlide.addText(`Metric: ${chartData.metric}`, {
      x: 0.7,
      y: 1.05,
      w: 5.5,
      h: 0.35,
      fontSize: 11,
      color: '93C5FD',
    });
    dataSlide.addChart(
      pptx.ChartType.bar,
      [
        {
          name: chartData.metric,
          labels: chartData.labels,
          values: chartData.values,
        },
      ],
      {
        x: 0.7,
        y: 1.45,
        w: 7.1,
        h: 5.4,
        catAxisLabelFontFace: 'Aptos',
        valAxisLabelFontFace: 'Aptos',
        showLegend: false,
        barDir: 'col',
        chartColors: ['4F8BFF'],
      },
    );
    dataSlide.addShape(pptx.ShapeType.roundRect, {
      x: 8.1,
      y: 1.45,
      w: 4.35,
      h: 5.4,
      fill: { color: '111827', transparency: 12 },
      line: { color: '1F2937', transparency: 35 },
    });
    dataSlide.addText(
      chartData.labels.map((label, idx) => ({
        text: `${label}: ${chartData.values[idx]}`,
        options: { bullet: { indent: 18 } },
      })),
      {
        x: 8.35,
        y: 1.8,
        w: 3.9,
        h: 4.6,
        fontSize: 13,
        color: 'E5E7EB',
      },
    );
  }

  const sections = buildSlideSections(
    input.title,
    input.text,
    Math.max(1, contentSlides - (chartData ? 1 : 0)),
  );

  const palette = ['0F172A', '111827', '1E1B4B', '0C4A6E', '292524', '102A43'];
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
      fontSize: 24,
      bold: true,
      color: 'E5E7EB',
    });
    slide.addShape(pptx.ShapeType.line, {
      x: 0.7,
      y: 1.1,
      w: 4.2,
      h: 0,
      line: { color: '38BDF8', pt: 1.5, transparency: 0 },
    });
    slide.addText(
      section.points.slice(0, 6).map((item) => ({
        text: sanitizeLine(item),
        options: { bullet: { indent: 18 } },
      })),
      {
        x: 0.75,
        y: 1.35,
        w: 6.95,
        h: 5.45,
        fontSize: 16,
        color: 'F8FAFC',
        breakLine: true,
      },
    );
    if (section.points[0]) {
      slide.addShape(pptx.ShapeType.roundRect, {
        x: 0.75,
        y: 6.95,
        w: 6.9,
        h: 0.38,
        fill: { color: '111827', transparency: 35 },
        line: { color: '111827', transparency: 100 },
      });
      slide.addText(sanitizeLine(section.points[0]).slice(0, 86), {
        x: 0.95,
        y: 7.02,
        w: 6.5,
        h: 0.2,
        fontSize: 9,
        color: 'D1D5DB',
      });
    }
  });

  const sourceUrls = Array.from(
    new Set(
      (input.text.match(/https?:\/\/[^\s)]+/g) || [])
        .map((url) => String(url).replace(/[),.;]+$/, '').trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  if (sourceUrls.length > 0) {
    const sourceSlide = pptx.addSlide();
    sourceSlide.background = { color: '0F172A' };
    sourceSlide.addText('Sources', {
      x: 0.7,
      y: 0.55,
      w: 11,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: 'E5E7EB',
    });
    sourceSlide.addText(
      sourceUrls.map((url) => ({
        text: url,
        options: { bullet: { indent: 16 } },
      })),
      {
        x: 0.8,
        y: 1.5,
        w: 12,
        h: 5.6,
        fontSize: 12,
        color: 'BFDBFE',
        breakLine: true,
      },
    );
  }

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

