# Hosts

A host runs the formats and apps for a person: it lists a folder, chooses the format that opens a
file, mounts an app on its manifest, and writes what they change. Context Manager is one host and
lives in its own repository. The hosts here need nothing from it.

- [`local`](local/): a server over a folder on this machine (`surfaces [path]`). See the
  [local host brief](../../docs/tasks/stage4/phase1/briefs/local_host.md).

A host's package is private until one is published. Its server code is under `src/server/` (Node,
no DOM) and its page under `src/client/` (the DOM, no Node), each with its own TypeScript config.
A client test opts into jsdom on its first line, as an app element's test does.
