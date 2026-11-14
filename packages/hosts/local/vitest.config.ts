import { appTest } from '../../../tooling/vitest.ts';

import { workspaceAliases } from './src/server/client-build.ts';

// Node by default, for the server. A test of the client opts into jsdom on its
// own first line: `// @vitest-environment jsdom`. The workspace packages resolve
// to their sources, as they do for the page in Vite, so a client test can mount a
// format without its package built.
export default appTest({ alias: workspaceAliases() });
