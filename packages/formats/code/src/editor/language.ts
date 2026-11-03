// Resolve a CodeMirror language by name using the bundled language descriptors.
//
// Everything CodeMirror here is imported inside the calls, never at module level:
// the element modules import this file, and `@codemirror/language` pulls in the
// view and state packages (about 108 KB gzipped). Importing an entry therefore
// defines its element and nothing more; CodeMirror loads when an element first
// connects (its lazy engine) or resolves a language. The grammar itself
// (`@codemirror/lang-*`) loads later still, through the descriptor's `.load()`.

import { reportError } from '@stillpointlab/common-format';

import type { LanguageDescription } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/**
 * Find the descriptor for a language name (e.g. "python", "JavaScript", "ts").
 * Matching is case-insensitive and covers each language's registered aliases.
 * Resolves `null` for an unknown, empty, or missing name.
 */
export async function findLanguage(
  name: string | null | undefined
): Promise<LanguageDescription | null> {
  if (!name) return null;
  const [{ LanguageDescription }, { languages }] = await Promise.all([
    import('@codemirror/language'),
    import('@codemirror/language-data'),
  ]);
  return LanguageDescription.matchLanguageName(languages, name, true);
}

/**
 * Resolve a language name to a CodeMirror `Extension`, lazily loading its grammar.
 * Returns an empty extension (plain text — line numbers only, no highlighting) when
 * the name is unknown or the descriptors or grammar fail to load.
 */
export async function loadLanguage(name: string | null | undefined): Promise<Extension> {
  try {
    const description = await findLanguage(name);
    if (!description) return [];
    return await description.load();
  } catch (err) {
    reportError('Failed to load code editor language', err);
    return [];
  }
}
