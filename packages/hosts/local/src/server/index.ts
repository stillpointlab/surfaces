// The local host's server, as a library: what a desktop shell or a development
// server imports. The `surfaces` command (`bin.ts`) is one listener around it.

export { createHost, createRequestCheck, statusFor } from './host';
export type { CheckedRequest, Host, HostOptions, LocalHost } from './host';
export { DEFAULT_APPS, DEFAULT_HOST_OPS } from './apps/registry';
export { nothingToResolve, readFile, scanReferences } from './apps/host-ops';
export type { HostOpContext, ServerHostOp, ServerHostOps } from './apps/host-ops';
export { appBase, inRegion } from '../shared/apps';
export type {
  AppLockAnswer,
  AppOpAnswer,
  AppPageAnswer,
  AppPageRedirect,
  AppPageShown,
  AppsAnswer,
  FoundInstance,
  LocalHostEvent,
  Region,
} from '../shared/apps';
export { createStaticPage, PAGE_HEADERS, PAGE_POLICY } from './page';
export type { PageHandler } from './page';
export { createNodePort, versionOf } from './port';
export type { NodePort, NodePortOptions, PortStart } from './port';
export type { GitStart, HostGitAccess, StageResult } from './git/repository';
export { createFolderWatcher } from './watcher';
export type { FolderWatcher, FolderWatcherOptions } from './watcher';
export { nodeListener } from './node-http';
export { runCli, DEFAULT_PORT } from './cli';
export type { CliIo, CliOptions, Serving } from './cli';
export { LIST_LIMIT, MAX_TEXT_BYTES } from './limits';
