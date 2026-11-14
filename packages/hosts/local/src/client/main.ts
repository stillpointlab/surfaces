// The page's entry: the host's own client over its routes, the five formats, and
// md's sanitizing renderer, started before anything opens (a deep link to a
// markdown file included; the pane waits for it before it mounts an md element).

import './theme.css';
import { createHttpClient } from './host-client';
import { installMarkdownRenderer } from './markdown';
import { startPage } from './page';
import { createHostRegistry, prepareFormat } from './registry';

void installMarkdownRenderer().catch((error: unknown) =>
  console.error('surfaces: the markdown renderer could not load', error)
);

startPage({
  client: createHttpClient(),
  registry: createHostRegistry(),
  prepare: prepareFormat,
});
