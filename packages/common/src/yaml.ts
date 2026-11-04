// YAML helpers the app cores share. DOM-free: this entry imports `yaml` and
// nothing else, so it runs in Node and the browser alike.

import { parse as parseYaml } from 'yaml';

/**
 * A scalar formatted for a value position: plain whenever YAML reads it back
 * as the identical value, else JSON-quoted (valid YAML double-quote style). A
 * value with a line break is always quoted.
 */
export function formatYamlScalar(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value.includes('\n')) return JSON.stringify(value);
  try {
    if (parseYaml(value) === value) return value;
  } catch {
    // Not parseable as a bare scalar — quote it.
  }
  return JSON.stringify(value);
}
