// `npm run serve -- [path] [--port <n>]`: the `surfaces` command in development
// mode, with the page served from its sources through Vite (see dev-page.ts).
// Built beside `bin.ts`, and run only from this repository, where Vite is.

import { runCli } from './cli';

// npm keeps the folder the command was typed in as `INIT_CWD`.
const result = await runCli(
  process.argv.slice(2),
  {
    cwd: process.env.INIT_CWD ?? process.cwd(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  },
  { dev: true }
);

if (typeof result === 'number') {
  process.exit(result);
} else {
  const stop = () => {
    void result.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
