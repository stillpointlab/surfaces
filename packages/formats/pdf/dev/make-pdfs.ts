/// <reference types="node" />
// Writes this package's test PDFs by hand: a small PDF writer of its own, each
// object written as text, the page contents compressed with zlib. Nothing is
// downloaded. Run in the package's folder:
//
//   node dev/make-pdfs.ts                 dev/media/: text, pages, cjk, jpx, dense, not-a-pdf
//   node dev/make-pdfs.ts --pages 200 <folder>   a long PDF, <folder>/pages-200.pdf, made
//                                         outside the package (it is too large for it)
//   node dev/make-pdfs.ts --dense 200 <folder>   a long PDF of dense text, <folder>/dense-200.pdf
//
// jpx.pdf wraps dev/media/jpx.jp2, which ImageMagick makes; the README has that
// command, and those for the PDFs made by other tools (a password, fonts embedded).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const media = new URL('./media/', import.meta.url).pathname;

/** A PDF's objects, numbered from 1, written in order with their cross-reference table. */
class Pdf {
  private readonly objects: (Buffer | null)[] = [];

  add(body: string | Buffer): number {
    this.objects.push(typeof body === 'string' ? Buffer.from(body, 'latin1') : body);
    return this.objects.length;
  }

  reserve(): number {
    this.objects.push(null);
    return this.objects.length;
  }

  set(number: number, body: string): void {
    this.objects[number - 1] = Buffer.from(body, 'latin1');
  }

  stream(dict: string, data: Buffer, compress = false): number {
    const bytes = compress ? deflateSync(data, { level: 9 }) : data;
    const filter = compress ? ' /Filter /FlateDecode' : '';
    return this.add(
      Buffer.concat([
        Buffer.from(`<< ${dict}${filter} /Length ${bytes.length} >>\nstream\n`, 'latin1'),
        bytes,
        Buffer.from('\nendstream', 'latin1'),
      ])
    );
  }

  /** The whole file, with `root` as its catalog. */
  bytes(root: number): Buffer {
    const parts: Buffer[] = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let at = parts[0].length;
    const offsets: number[] = [];
    this.objects.forEach((body, index) => {
      if (!body) throw new Error(`object ${index + 1} was reserved and never set`);
      const object = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
        body,
        Buffer.from('\nendobj\n', 'latin1'),
      ]);
      offsets.push(at);
      parts.push(object);
      at += object.length;
    });
    const size = this.objects.length + 1;
    const xref = [
      'xref',
      `0 ${size}`,
      '0000000000 65535 f ',
      ...offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${size} /Root ${root} 0 R >>`,
      'startxref',
      String(at),
      '%%EOF',
      '',
    ].join('\n');
    return Buffer.concat([...parts, Buffer.from(xref, 'latin1')]);
  }
}

/** One page's content and resources. */
interface PageSpec {
  content: string;
  resources: string;
}

/** The page tree and the catalog for `pages`, each `size` PDF units (a US letter page). */
function catalog(pdf: Pdf, pages: PageSpec[], size: [number, number] = [612, 792]): number {
  const tree = pdf.reserve();
  const kids = pages.map(({ content, resources }) => {
    const contents = pdf.stream('', Buffer.from(content, 'latin1'), true);
    return pdf.add(
      `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${size[0]} ${size[1]}] ` +
        `/Resources ${resources} /Contents ${contents} 0 R >>`
    );
  });
  pdf.set(
    tree,
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${kids.length} >>`
  );
  return pdf.add(`<< /Type /Catalog /Pages ${tree} 0 R >>`);
}

/** Text operators: each line in a font, at a size, from a point, as a PDF string. */
function text(lines: [font: string, size: number, x: number, y: number, string: string][]): string {
  return `BT\n${lines.map(([font, size, x, y, s]) => `/${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm ${s} Tj`).join('\n')}\nET\n`;
}

const helvetica = (pdf: Pdf) => pdf.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

/**
 * text.pdf: five of the standard fonts, none embedded. Helvetica, Times and
 * Courier draw in the browser's own fonts; Symbol and ZapfDingbats are the two
 * pdf.js always fetches from its standard fonts.
 */
function textPdf(): Buffer {
  const pdf = new Pdf();
  const fonts = (
    [
      ['F1', 'Helvetica'],
      ['F2', 'Times-Bold'],
      ['F3', 'Courier'],
      ['F4', 'Symbol'],
      ['F5', 'ZapfDingbats'],
    ] as const
  ).map(([key, base]) => {
    const encoding = key === 'F4' || key === 'F5' ? '' : ' /Encoding /WinAnsiEncoding';
    return `/${key} ${pdf.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base}${encoding} >>`)} 0 R`;
  });
  const content = text([
    ['F1', 28, 72, 700, '(A text PDF, its fonts not embedded)'],
    ['F2', 28, 72, 640, '(Times-Bold)'],
    ['F3', 28, 72, 580, '(Courier)'],
    ['F4', 28, 72, 520, '(abgdpqrs)'],
    ['F5', 28, 72, 460, '(3456789:;<=>)'],
  ]);
  return pdf.bytes(catalog(pdf, [{ content, resources: `<< /Font << ${fonts.join(' ')} >> >>` }]));
}

/** A page of `pages.pdf`: its number in large type and a band of colour, so each page has ink. */
function numberedPage(pdf: Pdf, font: number, number: number, count: number): PageSpec {
  const hue = ((number * 37) % 100) / 100;
  const band = `${hue.toFixed(2)} 0.45 ${(1 - hue).toFixed(2)} rg 72 300 468 200 re f\n0 g\n`;
  return {
    content: band + text([['F1', 48, 72, 640, `(Page ${number} of ${count})`]]),
    resources: `<< /Font << /F1 ${font} 0 R >> >>`,
  };
}

/** pages.pdf (and the long PDF): `count` pages, each its number and a band. */
function pagesPdf(count: number): Buffer {
  const pdf = new Pdf();
  const font = helvetica(pdf);
  const pages = Array.from({ length: count }, (_, at) => numberedPage(pdf, font, at + 1, count));
  return pdf.bytes(catalog(pdf, pages));
}

/**
 * cjk.pdf: Japanese text in a CID font that is not embedded, in the encoding
 * UniJIS-UCS2-H, a predefined CMap pdf.js reads from its character maps
 * (UniJIS-UCS2-H.bcmap, which uses Adobe-Japan1-UCS2). Without the map the line
 * is not drawn at all.
 */
function cjkPdf(): Buffer {
  const pdf = new Pdf();
  const descriptor = pdf.add(
    '<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 4 /FontBBox [-92 -250 1010 922] ' +
      '/ItalicAngle 0 /Ascent 752 /Descent -221 /CapHeight 737 /StemV 114 >>'
  );
  const cid = pdf.add(
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 ' +
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 2 >> ' +
      `/FontDescriptor ${descriptor} 0 R /DW 1000 >>`
  );
  const font = pdf.add(
    '<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5-UniJIS-UCS2-H ' +
      `/Encoding /UniJIS-UCS2-H /DescendantFonts [${cid} 0 R] >>`
  );
  const label = helvetica(pdf);
  // UTF-16BE, as the encoding's name says, written in hex.
  const japanese = Buffer.from('日本語のテキスト、文字の地図', 'utf16le').swap16().toString('hex');
  const content = text([
    ['F1', 32, 72, 680, `<${japanese.toUpperCase()}>`],
    ['F2', 14, 72, 640, '(CJK text, UniJIS-UCS2-H, its font not embedded)'],
  ]);
  return pdf.bytes(
    catalog(pdf, [{ content, resources: `<< /Font << /F1 ${font} 0 R /F2 ${label} 0 R >> >>` }])
  );
}

// The words of dense.pdf, drawn in an order fixed by a seed.
const WORDS = (
  'the of and to in is that for it as with was on be by at this are from or an which ' +
  'page text line pdf read find select copy screen reader canvas layer column worker ' +
  'river stone window garden morning letter number paper simple quiet light evening'
).split(' ');

// Lines of body text on a page of dense.pdf, under its heading.
const DENSE_LINES = 66;

/** A page of dense.pdf: `DENSE_LINES` lines of 9-point Helvetica, each a run of words to the margin. */
function densePage(pdf: Pdf, font: number, number: number): PageSpec {
  // A small linear congruential generator: the same words for the same page, every run.
  let seed = number * 7919;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 16;
  };
  const lines: [string, number, number, number, string][] = [
    ['F1', 12, 72, 750, `(Dense text, page ${number})`],
  ];
  for (let at = 0; at < DENSE_LINES; at += 1) {
    let line = '';
    while (line.length < 96) line += `${WORDS[next() % WORDS.length]} `;
    lines.push(['F1', 9, 72, 730 - at * 10.5, `(${line.trimEnd()})`]);
  }
  return { content: text(lines), resources: `<< /Font << /F1 ${font} 0 R >> >>` };
}

/** dense.pdf (and the long dense PDF): `count` pages of dense text, for measuring. */
function densePdf(count: number): Buffer {
  const pdf = new Pdf();
  const font = helvetica(pdf);
  const pages = Array.from({ length: count }, (_, at) => densePage(pdf, font, at + 1));
  return pdf.bytes(catalog(pdf, pages));
}

/** jpx.pdf: one JPEG 2000 image (JPXDecode), dev/media/jpx.jp2, 200×150, drawn 400×300. */
function jpxPdf(): Buffer {
  const pdf = new Pdf();
  const image = pdf.stream(
    '/Type /XObject /Subtype /Image /Width 200 /Height 150 /Filter /JPXDecode',
    readFileSync(join(media, 'jpx.jp2'))
  );
  const label = helvetica(pdf);
  const content =
    'q 400 0 0 300 106 400 cm /Im1 Do Q\n' +
    text([['F1', 14, 106, 370, '(A JPEG 2000 image, JPXDecode)']]);
  return pdf.bytes(
    catalog(pdf, [
      { content, resources: `<< /XObject << /Im1 ${image} 0 R >> /Font << /F1 ${label} 0 R >> >>` },
    ])
  );
}

function write(folder: string, name: string, bytes: Buffer | string): void {
  writeFileSync(join(folder, name), bytes);
  console.log(`make-pdfs: wrote ${name} (${Buffer.byteLength(bytes)} bytes)`);
}

const args = process.argv.slice(2);
if (args[0] === '--pages' || args[0] === '--dense') {
  const count = Number(args[1]);
  const folder = args[2];
  if (!Number.isInteger(count) || count < 1 || !folder) {
    console.error(`usage: node dev/make-pdfs.ts ${args[0]} <count> <folder>`);
    process.exit(1);
  }
  if (args[0] === '--pages') write(folder, `pages-${count}.pdf`, pagesPdf(count));
  else write(folder, `dense-${count}.pdf`, densePdf(count));
} else {
  write(media, 'text.pdf', textPdf());
  write(media, 'pages.pdf', pagesPdf(12));
  write(media, 'cjk.pdf', cjkPdf());
  write(media, 'jpx.pdf', jpxPdf());
  write(media, 'dense.pdf', densePdf(1));
  write(media, 'not-a-pdf.pdf', 'This is a plain text file with a .pdf name.\n');
}
