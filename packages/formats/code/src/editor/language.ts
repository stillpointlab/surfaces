// Resolve a CodeMirror language by name using the bundled language descriptors.
// `@codemirror/language-data` exposes lightweight `LanguageDescription`s whose
// actual grammar (`@codemirror/lang-*`) is loaded lazily via `.load()`, so importing
// this module is cheap — no grammar is pulled until `loadLanguage` runs.

import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';

import { reportError } from './log';

import type { Extension } from '@codemirror/state';

/**
 * Find the descriptor for a language name (e.g. "python", "JavaScript", "ts").
 * Matching is case-insensitive and covers each language's registered aliases.
 * Returns `null` for an unknown, empty, or missing name.
 */
export function findLanguage(name: string | null | undefined): LanguageDescription | null {
  if (!name) return null;
  return LanguageDescription.matchLanguageName(languages, name, true);
}

/**
 * Resolve a language name to a CodeMirror `Extension`, lazily loading its grammar.
 * Returns an empty extension (plain text — line numbers only, no highlighting) when
 * the name is unknown or the grammar fails to load.
 */
export async function loadLanguage(name: string | null | undefined): Promise<Extension> {
  const description = findLanguage(name);
  if (!description) return [];
  try {
    const support = await description.load();
    return support;
  } catch (err) {
    reportError('Failed to load code editor language', err);
    return [];
  }
}
