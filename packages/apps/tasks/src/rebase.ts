/**
 * Draft rebasing's rules (phase 7, tasks-rules; the brief's decision on
 * drafts): the frontmatter comparison and the rebased content. When to rebase,
 * the formatter, and the saves stay with the host.
 */
import { parseFrontmatter, rewriteFrontmatter } from './frontmatter.js';

import type { FrontmatterPatchValue } from './frontmatter.js';
import type { SharedTasksManifest } from './types.js';

/** The frontmatter keys the card surface owns: the scope of a metadata rebase. */
export function trackedCardKeys(manifest: Pick<SharedTasksManifest, 'frontmatterKey'>): string[] {
  return [manifest.frontmatterKey, 'title', 'tags', 'blocked', 'completed', 'pr'];
}

/** My frontmatter changes against a base, as a patch over `keys`. */
export interface MetadataDelta {
  /** Reapplies my changes to `keys` onto another base. */
  patch: Record<string, FrontmatterPatchValue>;
  /** The keys among `keys` I changed. */
  changedKeys: string[];
  /**
   * A change the patch cannot carry: a key outside `keys`, or a value the
   * byte-stable rewriter does not write. Reapplying the patch alone would
   * drop it.
   */
  untrackedChange: boolean;
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Key-wise delta of my frontmatter against its base's, over `keys`. */
export function metadataDelta(
  mine: Record<string, unknown>,
  base: Record<string, unknown>,
  keys: readonly string[]
): MetadataDelta {
  const patch: Record<string, FrontmatterPatchValue> = {};
  const changedKeys: string[] = [];
  let untrackedChange = false;
  for (const key of new Set([...Object.keys(mine), ...Object.keys(base)])) {
    const value = mine[key];
    if (same(value, base[key])) continue;
    if (!keys.includes(key)) {
      untrackedChange = true;
      continue;
    }
    changedKeys.push(key);
    if (value === undefined) {
      patch[key] = null; // I removed it
    } else if (typeof value === 'string') {
      patch[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      patch[key] = value as string[];
    } else {
      untrackedChange = true; // a shape the rewriter can't carry
    }
  }
  return { patch, changedKeys, untrackedChange };
}

/**
 * Whether my draft changes only its base's frontmatter. Equal bodies prove it.
 * Otherwise the answer is the base with all my frontmatter changes applied:
 * the draft is metadata-only exactly when that, put through the host's save
 * formatting, reproduces it byte for byte. `null` when no such reconstruction
 * exists (a change the rewriter cannot carry).
 */
export function metadataOnlyCheck(
  draft: string,
  base: string
): { sameBody: true } | { sameBody: false; reconstructed: string | null } {
  const mine = parseFrontmatter(draft);
  const theirs = parseFrontmatter(base);
  if (mine.body === theirs.body) return { sameBody: true };
  const allKeys = Object.keys({ ...(mine.data ?? {}), ...(theirs.data ?? {}) });
  const full = metadataDelta(mine.data ?? {}, theirs.data ?? {}, allKeys);
  return {
    sameBody: false,
    reconstructed: full.untrackedChange ? null : rewriteFrontmatter(base, full.patch),
  };
}

export interface RebaseMetadataInput {
  /** My draft. */
  draft: string;
  /** The version my draft is based on. */
  base: string;
  /** The latest version, to rebase onto. */
  latest: string;
  /** The keys the patch carries (`trackedCardKeys`). */
  keys: readonly string[];
  /**
   * The explicit resolution: my changes to `keys` win and every other change
   * of mine is dropped. Without it the rebase must be lossless — no other
   * change of mine, and no key both sides changed differently.
   */
  mineWins: boolean;
  /** The host's answer to `metadataOnlyCheck`: whether my draft touches only frontmatter. */
  metadataOnly: boolean;
}

export type RebaseMetadataOutcome =
  | { outcome: 'rebased'; content: string }
  /** Frontmatter only, but not reapplied without loss: a key collides, or a change the patch can't carry. */
  | { outcome: 'metadata' }
  /** My draft edits the body. */
  | { outcome: 'content' };

/** My frontmatter changes, reapplied onto the latest version — or why not. */
export function rebaseMetadata(input: RebaseMetadataInput): RebaseMetadataOutcome {
  if (!input.metadataOnly) return { outcome: 'content' };
  const mine = parseFrontmatter(input.draft).data ?? {};
  const base = parseFrontmatter(input.base).data ?? {};
  const { patch, changedKeys, untrackedChange } = metadataDelta(mine, base, input.keys);
  if (!input.mineWins) {
    // Byte-different but parse-equal frontmatter (formatting only) has nothing
    // to reapply, and taking the latest would still drop my bytes.
    if (untrackedChange || changedKeys.length === 0) return { outcome: 'metadata' };
    const latest = parseFrontmatter(input.latest).data ?? {};
    const collision = changedKeys.some(
      (key) => !same(latest[key], base[key]) && !same(latest[key], mine[key])
    );
    if (collision) return { outcome: 'metadata' };
  }
  return { outcome: 'rebased', content: rewriteFrontmatter(input.latest, patch) };
}
