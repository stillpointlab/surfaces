// Which format opens a path: the five descriptors, in order, with code as the
// fallback for a text file nothing matched. Order matters: code opens `.md` too,
// so md comes first. Importing the descriptors defines no element and loads no
// engine; each format's elements load when a file of that kind opens.

import { codeFormat } from '@stillpointlab/code-format/format';
import { createFormatRegistry } from '@stillpointlab/common-format/format';
import { imageFormat } from '@stillpointlab/image-format/format';
import { mdFormat } from '@stillpointlab/md-format/format';
import { sheetFormat } from '@stillpointlab/sheet-format/format';
import { xmdlFormat } from '@stillpointlab/xmdl-format/format';

import { installMarkdownRenderer } from './markdown';

import type { FormatDescriptor, FormatRegistry } from '@stillpointlab/common-format/format';

export function createHostRegistry(): FormatRegistry {
  return createFormatRegistry([mdFormat, xmdlFormat, sheetFormat, imageFormat, codeFormat], {
    fallback: codeFormat,
  });
}

/** What must be in place before a format's element mounts: md's sanitizing renderer. */
export function prepareFormat(format: FormatDescriptor): Promise<void> {
  return format.id === mdFormat.id ? installMarkdownRenderer() : Promise.resolve();
}
