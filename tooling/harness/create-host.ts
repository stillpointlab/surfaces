// The harness's side of a create form (spec create-from-the-app): it answers
// the form's one op, `create`, with the app's own `seed` and the folder a
// control chose, as a host answers it before placing and seeding the files.
// What a fixture does with a created plan (show the new instance) is its own.
import { answerOps, ok } from '@stillpointlab/common-format/app';

import type { FileChange, Result } from '@stillpointlab/common-format/app';

/** Where the harness creates: a folder, or the repository root with or without consent. */
export interface CreateTarget {
  folder: string;
  confirmRoot?: boolean;
}

export interface CreateHostOptions<Input> {
  /** The app's `core.seed`. */
  seed(input: Input & CreateTarget): Result<{ manifestPath: string; files: FileChange[] }>;
  /** Where to create now. */
  target(): CreateTarget;
  /** Show what was created. */
  created(plan: { manifestPath: string; files: FileChange[] }): void;
}

/** Answer `create` on `form` through `seed`; the reply is the seed's refusal or the manifest's path. */
export function answerCreate<Input>(
  form: HTMLElement,
  options: CreateHostOptions<Input>
): () => void {
  return answerOps<{ create: { op: { input: Input }; reply: { manifestPath: string } } }>(
    form,
    (op) => {
      const target = options.target();
      const plan = options.seed({ ...op.input, ...target });
      if (!plan.ok) return plan;
      options.created(plan);
      return ok({ manifestPath: plan.manifestPath });
    }
  );
}

/** The targets a fixture's control offers, by label. */
export const CREATE_TARGETS: Record<string, CreateTarget> = {
  'a folder': { folder: 'created' },
  'the repository root': { folder: '' },
  'the root, with consent': { folder: '', confirmRoot: true },
};
