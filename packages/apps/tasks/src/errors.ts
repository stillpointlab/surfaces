import type { ZodError } from 'zod';

/**
 * The error the tasks app's pure modules throw when they reject input. It
 * carries no HTTP status: the board service maps it back to the error it
 * surfaced before (a `ValidationError` with these details, or the
 * `MANIFEST_UNPATCHABLE` conflict for settings edits), so responses do not
 * change.
 */
export class TasksRuleError extends Error {
  readonly code: string;
  readonly details: ZodError['issues'];

  constructor(code: string, message: string, details: ZodError['issues'] = []) {
    super(message);
    this.name = 'TasksRuleError';
    this.code = code;
    this.details = details;
  }
}
