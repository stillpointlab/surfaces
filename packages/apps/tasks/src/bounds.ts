/**
 * The tasks app's bounds (the app contract's `AppBounds`): what an op, a view
 * and a create input must be before the core sees them. Sizes, slugs and no
 * unknown keys, with cards named by path as the board and the strip ask; the
 * core checks everything that needs the manifest (columns, kinds, tags,
 * boards, the pool and the cards), and the create plan checks reserved and
 * repeated ids, as the form does.
 *
 * Every limit, enum and pattern is Context Manager's at 8fa439ba, where these
 * bounded the generic op route, the view reads and the create route.
 */
import { bounded } from '@stillpointlab/common-format/app';
import { z } from 'zod';

import { TASKS_ID_MAX_LENGTH, TASKS_SLUG_PATTERN } from './paths.js';
import { UNASSIGNED_COLUMN_ID, UNASSIGNED_DIR } from './types.js';

import type { TasksViews } from './core.js';
import type { TasksCreateFields } from './createRules.js';
import type { TasksElementOps } from './module.js';
import type { AppBounds, AppOp, AppView } from '@stillpointlab/common-format/app';

/** A path in the repository: a card, a board, or a file that links to a card. */
const repoPath = z.string().min(1).max(1024);

const tasksIdSchema = z
  .string()
  .max(TASKS_ID_MAX_LENGTH)
  .regex(TASKS_SLUG_PATTERN, 'must be a lowercase slug (a-z, 0-9, -, _)');

// One settings change: a column or kind added, changed or removed, or a picker
// set. None changes an id, a kind's folder or its template (ids are permanent).
// An update must change something; an empty description clears the key.
const manifestEdit = z
  .discriminatedUnion('op', [
    z
      .object({
        op: z.literal('add-column'),
        id: tasksIdSchema,
        label: z.string().trim().min(1).max(40),
        description: z.string().trim().min(1).max(200).optional(),
      })
      .strict(),
    z
      .object({
        op: z.literal('update-column'),
        id: tasksIdSchema,
        label: z.string().trim().min(1).max(40).optional(),
        description: z.string().trim().max(200).optional(),
      })
      .strict(),
    z.object({ op: z.literal('remove-column'), id: tasksIdSchema }).strict(),
    z.object({ op: z.literal('set-default-column'), id: tasksIdSchema }).strict(),
    z.object({ op: z.literal('set-done-column'), id: tasksIdSchema }).strict(),
    z
      .object({
        op: z.literal('add-kind'),
        id: tasksIdSchema,
        label: z.string().trim().min(1).max(40).optional(),
        badge: z.string().trim().min(1).max(4).optional(),
      })
      .strict(),
    z
      .object({
        op: z.literal('update-kind'),
        id: tasksIdSchema,
        label: z.string().trim().min(1).max(40).optional(),
        badge: z.string().trim().min(1).max(4).optional(),
        creatable: z.boolean().optional(),
      })
      .strict(),
    z.object({ op: z.literal('remove-kind'), id: tasksIdSchema }).strict(),
  ])
  .superRefine((body, ctx) => {
    if (body.op === 'update-column' && body.label === undefined && body.description === undefined) {
      ctx.addIssue({ code: 'custom', message: 'nothing to update — pass label or description' });
    }
    if (
      body.op === 'update-kind' &&
      body.label === undefined &&
      body.badge === undefined &&
      body.creatable === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'nothing to update — pass label, badge, or creatable',
      });
    }
    // The reserved names, as the manifest's own rules refuse them.
    if (body.op === 'add-column' && body.id === UNASSIGNED_COLUMN_ID) {
      ctx.addIssue({
        code: 'custom',
        message: `column id '${UNASSIGNED_COLUMN_ID}' is reserved for the implicit unassigned column`,
      });
    }
    if (
      body.op === 'add-kind' &&
      (body.id === UNASSIGNED_COLUMN_ID || `${body.id}s` === UNASSIGNED_DIR)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `'${UNASSIGNED_DIR}' is reserved for the backlog pool`,
      });
    }
  });

/** The core's twelve ops. The host's own (`resolve`, `read-file`, …) a host bounds itself. */
export const tasksOpSchema = z.discriminatedUnion('type', [
  // `column` is one of the manifest's ids, or null for Unassigned.
  z
    .object({ type: z.literal('move'), path: repoPath, column: z.string().min(1).nullable() })
    .strict(),
  z
    .object({
      type: z.literal('move-file'),
      path: repoPath,
      target: z.union([
        z.object({ pool: z.literal(true) }).strict(),
        z.object({ boardPath: z.string().max(1024), column: z.string().min(1) }).strict(),
      ]),
    })
    .strict(),
  // The pool's card paths in their whole new order.
  z.object({ type: z.literal('reorder-pool'), paths: z.array(repoPath).max(1000) }).strict(),
  // null removes the key; a title of only spaces is refused.
  z
    .object({
      type: z.literal('set-title'),
      path: repoPath,
      title: z.string().trim().min(1).max(200).nullable(),
    })
    .strict(),
  // The card's whole tag set; an empty list removes the key.
  z
    .object({
      type: z.literal('set-tags'),
      path: repoPath,
      tags: z.array(z.string().trim().min(1).max(60)).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal('create-card'),
      boardPath: z.string().max(1024),
      title: z.string().trim().min(1).max(200),
      kind: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'must be a lowercase slug (a-z, 0-9, -, _)'),
    })
    .strict(),
  z
    .object({
      type: z.literal('fix-references'),
      path: repoPath,
      referencingPaths: z.array(repoPath).min(1).max(200),
    })
    .strict(),
  z.object({ type: z.literal('add-tag'), tag: z.string().trim().min(1).max(60) }).strict(),
  z.object({ type: z.literal('edit-manifest'), edit: manifestEdit }).strict(),
  // A new phase says which stage it goes in.
  z
    .object({
      type: z.literal('create-stage-phase'),
      kind: z.enum(['phase', 'stage']),
      stage: z.number().int().positive().optional(),
    })
    .strict()
    .refine((op) => op.kind === 'stage' || op.stage !== undefined, {
      message: "Creating a phase requires 'stage'",
    }),
  z
    .object({
      type: z.literal('set-current'),
      stage: z.number().int().positive(),
      phase: z.number().int().positive(),
    })
    .strict(),
  // The cards brought along, by path.
  z
    .object({
      type: z.literal('close'),
      kind: z.enum(['phase', 'stage']),
      paths: z.array(repoPath).max(1000),
    })
    .strict(),
]);

/** The three views: one board by path, one stage's phases, and the nav. */
export const tasksViewSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('board'), path: z.string().max(1024) }).strict(),
  z.object({ type: z.literal('stage'), stage: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('nav') }).strict(),
]);

/**
 * A create's columns and kinds. The folder and the root consent are the
 * host's to add; the plan checks the rest (`checkTasksCreate`: ids, reserved
 * names, duplicates), as the form does.
 */
export const tasksCreateInputSchema = z
  .object({
    columns: z
      .array(
        z
          .object({
            id: tasksIdSchema,
            label: z.string().trim().min(1).max(40),
            description: z.string().trim().min(1).max(200).optional(),
          })
          .strict()
      )
      .min(1)
      .max(50),
    kinds: z
      .array(
        z
          .object({
            id: tasksIdSchema,
            label: z.string().trim().min(1).max(40).optional(),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();

export const tasksBounds: AppBounds<TasksViews, TasksElementOps, TasksCreateFields> = {
  op: (input) =>
    bounded<'op', AppOp<TasksElementOps>>('op', tasksOpSchema, input, 'APP_OP_INVALID', 'The op'),
  view: (input) =>
    bounded<'view', AppView<TasksViews>>(
      'view',
      tasksViewSchema,
      input,
      'APP_VIEW_INVALID',
      'The view'
    ),
  create: (input) =>
    bounded<'input', TasksCreateFields>(
      'input',
      tasksCreateInputSchema,
      input,
      'APP_CREATE_INVALID',
      'The task project'
    ),
};
