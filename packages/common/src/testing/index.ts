// The contract conformance suites: `describe` blocks a format runs inside its own
// vitest project to prove each element it ships honours the host contracts in
// ../contracts.ts. They assert only what the contract promises (readiness, set
// and read back, `content-change`, `readonly`, keymap modes, focus) and take a
// few hooks for what only the format knows: how to tell the content reached the
// DOM and how to perform one user edit. They use no fake timers, private fields
// or jsdom-specific stubs, so they pass unchanged under vitest browser mode.
//
//   import { describeEditorContract } from '@stillpointlab/common-format/testing';
//   describeEditorContract('sample-editor', { content: 'draft', edit: (el) => … });

export { describePreviewContract } from './preview';
export type { PreviewContractOptions } from './preview';
export { describeEditorContract } from './editor';
export type { EditorContractOptions } from './editor';
export { describeImagePreviewContract } from './image-preview';
export type { ImagePreviewContractOptions } from './image-preview';
export { describeDiffContract } from './diff';
export type { DiffContractOptions } from './diff';
export { contentChanges, mount, pending, settledBy } from './support';
