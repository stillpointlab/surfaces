import { appTest } from '../../../tooling/vitest.ts';

// Node by default, for the server. A test of the client opts into jsdom on its
// own first line: `// @vitest-environment jsdom`.
export default appTest();
