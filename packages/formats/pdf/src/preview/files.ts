// The files pdf.js fetches by name while it draws: the character maps and the
// standard fonts, copied beside this module by tooling/gen-pdfjs.ts. Each kind
// is named by one `new URL()` relative to this module, which the preview entry
// imports statically, so it is built into `dist/preview.js` with the copies at
// `dist/pdfjs/`, and a host's Vite build emits each file as one of its own (see
// "Files fetched by name" in the root README). An address relative to
// `import.meta.url` must be in an entry's own file: in the engine's split file
// it would name a folder beside `dist/chunks/`.
//
// pdf.js is given `useWorkerFetch: false` and this class as its
// `BinaryDataFactory`: the worker asks the page for a file by kind and name,
// and the page answers with its bytes.

/** What pdf.js asks of its factory, by kind and name. */
export interface FileRequest {
  kind: string;
  filename: string;
}

// A name pdf.js asks for is a file's name and no more: no folder, nothing that
// climbs out of one.
const FILE_NAME = /^[\w-][\w.-]*$/;

/**
 * Where the file pdf.js asks for is, or null when this package has no such
 * file: a character map (`*.bcmap`) or a standard font (`*.pfb`, `*.ttf`). Each
 * address has its ending fixed, so a host's build emits those files and not
 * the licences beside them.
 */
export function addressOf({ kind, filename }: FileRequest): string | null {
  if (!FILE_NAME.test(filename)) return null;
  const dot = filename.lastIndexOf('.');
  const base = filename.slice(0, dot);
  const ending = filename.slice(dot);
  if (kind === 'cMapUrl' && ending === '.bcmap') {
    return new URL(`./pdfjs/cmaps/${base}.bcmap`, import.meta.url).href;
  }
  if (kind === 'standardFontDataUrl' && ending === '.pfb') {
    return new URL(`./pdfjs/standard_fonts/${base}.pfb`, import.meta.url).href;
  }
  if (kind === 'standardFontDataUrl' && ending === '.ttf') {
    return new URL(`./pdfjs/standard_fonts/${base}.ttf`, import.meta.url).href;
  }
  return null;
}

/**
 * The bytes of a `data:` address, read here: a host's build may write a small
 * file into its code as one (Context Manager's does under 4 kB, 134 of the
 * character maps), and a page's `connect-src 'self'` refuses to fetch it.
 */
export function bytesOfData(address: string): Uint8Array {
  const comma = address.indexOf(',');
  const head = address.slice(0, comma);
  const body = address.slice(comma + 1);
  if (head.endsWith(';base64')) return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  // Percent-encoded: every byte that is not printable is `%XX`.
  const bytes: number[] = [];
  for (let at = 0; at < body.length; at += 1) {
    if (body[at] === '%') {
      bytes.push(parseInt(body.slice(at + 1, at + 3), 16));
      at += 2;
    } else {
      bytes.push(body.charCodeAt(at));
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * pdf.js's `BinaryDataFactory`: it is constructed with the folders' addresses
 * pdf.js was given (none), and asked for each file it needs as it needs it, so
 * only what a PDF needs is fetched. A PDF whose fonts are embedded asks for none.
 */
export class PackageFiles {
  async fetch(request: FileRequest): Promise<Uint8Array> {
    const address = addressOf(request);
    if (address === null) {
      throw new Error(`The PDF format has no ${request.kind} file named ${request.filename}.`);
    }
    if (address.startsWith('data:')) return bytesOfData(address);
    const response = await fetch(address);
    if (!response.ok) throw new Error(`${address} answered ${response.status}.`);
    return new Uint8Array(await response.arrayBuffer());
  }
}
