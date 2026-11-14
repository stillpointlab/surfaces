#!/usr/bin/env node
// The `surfaces` command. This file is checked in, so npm links it when it
// installs; what it runs is built (`npm run build --workspace
// @stillpointlab/local-host`, or `npm run serve` at the root).
import('../dist/server/bin.js').catch((error) => {
  const notBuilt =
    error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes('dist/server/bin.js');
  globalThis.console.error(
    notBuilt
      ? 'surfaces: not built yet. Run `npm run build --workspace @stillpointlab/local-host` in the surfaces repository.'
      : error
  );
  globalThis.process.exitCode = 1;
});
