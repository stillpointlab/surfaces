// The format descriptor: how a host learns which format opens a path and how to
// mount it, from the format's package alone. Each format package exports one
// from its `./format` entry; a host registers them and asks the registry. Data and
// one `apply`: the host creates the element, places it, listens to it and reads it
// back through the contracts in ./contracts.ts, and the format only chooses its own
// setter and attributes. Importing this module touches no DOM.

/** A file as a host hands it to a format. Paths use `/`. */
export interface FormatFile {
  path: string;
  /** The file's text, for a format that needs text. */
  text?: string;
  /** A URL the element can load, for a format that needs a URL. */
  url?: string;
}

export interface FormatElementEntry {
  tag: string;
  /**
   * Load the module that defines `tag`. It resolves to the same module as the
   * package's `./preview` or `./editor` entry, so an element is never defined twice.
   */
  load(): Promise<unknown>;
}

export interface FormatDescriptor {
  /** `md`, `code`, `sheet`, `xmdl`, `image`. */
  id: string;
  /** The extensions it opens: lower case, with the dot (`.md`). */
  opens: readonly string[];
  /** A `text` format is given `FormatFile.text` and no `url`; a `url` format the reverse. */
  needs: 'text' | 'url';
  preview: FormatElementEntry;
  editor?: FormatElementEntry;
  /** Hand a mounted preview or editor its content, with the attributes the path implies. */
  apply(element: HTMLElement, file: FormatFile): void;
}

export interface FormatRegistry {
  /** The first registered format whose `opens` has the path's extension, or `null`. */
  find(path: string): FormatDescriptor | null;
  /** What opens a text file nothing matched. */
  readonly fallback: FormatDescriptor | null;
  readonly formats: readonly FormatDescriptor[];
}

/** The last segment of a path: `docs/notes.md` → `notes.md`. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * A path's extension as the registry matches it: from the last dot of its file
 * name, lower case, with the dot (`types.D.TS` → `.ts`), or `''` when the name has
 * no dot. A leading dot counts, so `.md` is `.md`, as Context Manager classes it.
 */
export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

const EXTENSION = /^\.[^./]+$/;

/**
 * A registry over `formats`, in order: where two open the same extension, the
 * first registered wins. It holds no host policy (no size limits, no "is it
 * text"): `find` never reads a file, and a host that finds nothing decides for
 * itself whether to use `fallback`. Throws if two formats share an `id` or an
 * `opens` entry is not a lower-case extension with one dot.
 */
export function createFormatRegistry(
  formats: readonly FormatDescriptor[],
  options: { fallback?: FormatDescriptor } = {}
): FormatRegistry {
  const ordered = Object.freeze([...formats]);
  const byExtension = new Map<string, FormatDescriptor>();
  const ids = new Set<string>();
  for (const format of ordered) {
    if (ids.has(format.id)) throw new TypeError(`format "${format.id}" is registered twice`);
    ids.add(format.id);
    for (const extension of format.opens) {
      if (!EXTENSION.test(extension) || extension !== extension.toLowerCase()) {
        throw new TypeError(
          `format "${format.id}" opens "${extension}": expected a lower-case extension with its dot, such as ".md"`
        );
      }
      if (!byExtension.has(extension)) byExtension.set(extension, format);
    }
  }
  return {
    find: (path) => byExtension.get(extensionOf(path)) ?? null,
    fallback: options.fallback ?? null,
    formats: ordered,
  };
}
