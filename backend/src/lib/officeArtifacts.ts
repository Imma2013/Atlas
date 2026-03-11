import * as XLSX from 'xlsx';
import PptxGenJS from 'pptxgenjs';
import officeParser from 'officeparser';

const escapeCsvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

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

export const createPresentationFromText = async (input: { title: string; text: string }) => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';

  const titleSlide = pptx.addSlide();
  titleSlide.addText(input.title || 'Atlas Presentation', {
    x: 0.5,
    y: 1.0,
    w: 12.3,
    h: 1.0,
    fontSize: 34,
    bold: true,
    color: '1F2937',
  });

  const bullets = input.text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

  const chunks: string[][] = [];
  for (let i = 0; i < bullets.length; i += 7) {
    chunks.push(bullets.slice(i, i + 7));
  }
  if (chunks.length === 0) {
    chunks.push([input.text.trim() || 'No content provided']);
  }

  chunks.slice(0, 10).forEach((chunk, idx) => {
    const slide = pptx.addSlide();
    slide.addText(`Slide ${idx + 1}`, {
      x: 0.6,
      y: 0.4,
      w: 12.0,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: '111827',
    });
    slide.addText(
      chunk.map((item) => ({ text: item, options: { bullet: { indent: 18 } } })),
      {
        x: 0.8,
        y: 1.3,
        w: 11.7,
        h: 5.5,
        fontSize: 18,
        color: '111827',
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
