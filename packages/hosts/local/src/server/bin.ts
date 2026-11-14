#!/usr/bin/env node
// The `surfaces` command: a thin listener around the host library.

import { runCli } from './cli';

// Under `npm run serve` (or `npx`) the script runs in the package's folder, and
// npm keeps the folder the command was typed in as `INIT_CWD`.
const result = await runCli(process.argv.slice(2), {
  cwd: process.env.INIT_CWD ?? process.cwd(),
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});

if (typeof result === 'number') {
  process.exit(result);
} else {
  const stop = () => {
    void result.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
