// Host ops the page answers in the browser, for an app's registration to name.
// Each is about the page, not about an app, so two apps may share one.

import { fail, ok } from '@stillpointlab/common-format/app';

import { formatAddress } from '../address';

import type { PageOp } from './registry';

/**
 * A file's editor, as an address: `{ href }` to `#/edit/<path>`, which is the
 * only way a shell opens a file's editor. A locked file opens in its preview.
 */
export const editorLink: PageOp = (op) =>
  typeof op.path === 'string' && op.path !== ''
    ? ok({ href: formatAddress({ view: 'edit', path: op.path }) })
    : fail('APP_OP_INVALID', 'The op is not valid: path: a file’s path is needed.');
