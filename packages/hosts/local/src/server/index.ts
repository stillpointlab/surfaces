// The local host's server, as a library: what a desktop shell or a development
// server imports. The `surfaces` command (`bin.ts`) is one listener around it.

export { createHost, statusFor } from './host';
export type { Host, HostOptions, LocalHost } from './host';
export { createNodePort, versionOf } from './port';
export type { NodePort, NodePortOptions, PortStart } from './port';
export { createFolderWatcher } from './watcher';
export type { FolderWatcher, FolderWatcherOptions } from './watcher';
export { nodeListener } from './node-http';
export { runCli, DEFAULT_PORT } from './cli';
export type { CliIo, Serving } from './cli';
export { LIST_LIMIT, MAX_TEXT_BYTES } from './limits';
