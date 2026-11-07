// The app contract, as far as the apps use it: what a host and an app agree on.
//
// Two halves. The lifecycle: a manifest marks an instance of an app, and the app
// says which paths it owns and how the instance is described. The element: the
// host sets state, and the element asks the host for ops, each with its own
// reply. `project` and `apply` from the August design (Context Manager's
// apps-as-executors spike) are not named here yet: the logic they would hold
// still lives in the host's services.
//
// A light entry (`@stillpointlab/common-format/app`): an app element and a host
// page import it without pulling in the formats' runtime. The helpers touch the
// DOM only when called.

import type { ReadyElement } from './contracts';

export { createReadyGate, READY_ATTRIBUTE, READY_EVENT } from './ready';
export type { ReadyGate, ReadyHost } from './ready';
export { report, reportError, setErrorHandler, setReporter } from './log';
export type { ErrorHandler, Level, Reporter } from './log';

/** A refusal: a stable, machine-readable `code`, a `message` for a person. */
export interface Failure {
  ok: false;
  code: string;
  message: string;
  /** Structured causes, where the refusing function had them (zod issues, say). */
  details?: unknown[];
}

/** Success with the answer's fields beside `ok`, or a failure. Nothing throws for a rule. */
export type Result<T extends object = object> = ({ ok: true } & T) | Failure;

/** Build a success. `ok()` for one with no fields. */
export function ok<T extends object = Record<never, never>>(value?: T): { ok: true } & T {
  return { ...(value as T), ok: true };
}

/** Build a failure. */
export function fail(code: string, message: string, details?: unknown[]): Failure {
  return details === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, details };
}

// ---- The lifecycle half -----------------------------------------------------

/** One node of a folder's tree. Structural, so a host's own tree type fits it. */
export interface FolderNode {
  path: string;
  type: 'blob' | 'tree';
  sha?: string;
  size?: number;
}

/**
 * What an app tells its host about one instance. Pure: tree and bytes in, paths
 * and a description out. The host keeps its own policy beside it (the view's
 * name, error codes, adoption budgets).
 */
export interface AppLifecycle<Detail extends { label: string } = { label: string }> {
  /** The manifest filename that marks a candidate instance (`tasks.yaml`). */
  manifestName: string;
  /**
   * Validate one manifest and derive the instance's scope: every path it owns,
   * anchored at `manifestPath`. Lists every error, since a manifest can be wrong
   * in several ways at once.
   */
  validateAndScope(
    content: string,
    nodes: FolderNode[],
    manifestPath: string
  ): { ok: true; scope: Set<string>; warnings: string[] } | { ok: false; errors: string[] };
  /**
   * What one instance shows in the host's tree: its label and anything else the
   * app draws there. Called whether or not the manifest parses (`content` is
   * null when the file is missing).
   */
  describeInstance(
    content: string | null,
    nodes: FolderNode[],
    manifestPath: string,
    appOnlyPaths: string[]
  ): Detail;
}

// ---- The element half -------------------------------------------------------

/** An app element: the host sets its state; it settles like every surface. */
export interface AppElement<State> extends ReadyElement {
  setState(state: State): void;
}

/** The event an app element raises to ask its host for an op. */
export const APP_OP_EVENT = 'app-op';

/**
 * An app's ops, by type: each names its fields (`op`) and the fields of its
 * successful reply (`reply`). Ops name things by path, never by a host's ids.
 */
export type AppOpMap = Record<string, { op: object; reply: object }>;

/** One op of a map, as raised: its `type` and its fields. */
export type AppOp<M extends AppOpMap> = {
  [K in keyof M & string]: { type: K } & M[K]['op'];
}[keyof M & string];

/** The reply to one op type. */
export type AppOpReply<M extends AppOpMap, K extends keyof M> = Result<M[K]['reply']>;

/** The `app-op` event's detail. */
export interface AppOpDetail<Op = unknown, Reply extends object = object> {
  op: Op;
  /** Answer the op. Only the first call counts. */
  respond(result: Result<Reply> | Promise<Result<Reply>>): void;
}

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'string' ? err : 'The host failed the op';

/**
 * Ask the host for one op. Dispatches a bubbling, composed, cancelable `app-op`
 * event; a host claims it with `preventDefault()` and answers through
 * `respond`. Nothing claiming it resolves to `OP_UNHANDLED` straight away, so an
 * element never waits on a host that is not there. A rejected answer resolves to
 * `OP_FAILED`. A host that claims an op must answer it.
 */
export function requestOp<M extends AppOpMap, K extends keyof M & string>(
  element: EventTarget,
  op: { type: K } & M[K]['op']
): Promise<AppOpReply<M, K>> {
  return new Promise((resolve) => {
    let answered = false;
    const detail: AppOpDetail<typeof op, M[K]['reply']> = {
      op,
      respond(result) {
        if (answered) return;
        answered = true;
        Promise.resolve(result).then(resolve, (err: unknown) =>
          resolve(fail('OP_FAILED', messageOf(err)))
        );
      },
    };
    const event = new CustomEvent(APP_OP_EVENT, {
      detail,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    if (!event.defaultPrevented && !answered) {
      answered = true;
      resolve(fail('OP_UNHANDLED', `Nothing answered the "${op.type}" op`));
    }
  });
}

/**
 * The host's side: claim every op `element` raises (and any raised inside it)
 * and answer each with `handler`. A handler that throws or rejects answers
 * `OP_FAILED`. Returns a function that stops answering.
 */
export function answerOps<M extends AppOpMap>(
  element: EventTarget,
  handler: (op: AppOp<M>) => Result<object> | Promise<Result<object>>
): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<AppOpDetail<AppOp<M>>>).detail;
    if (!detail || typeof detail.respond !== 'function') return;
    event.preventDefault();
    let answer: Promise<Result<object>>;
    try {
      answer = Promise.resolve(handler(detail.op));
    } catch (err) {
      answer = Promise.resolve(fail('OP_FAILED', messageOf(err)));
    }
    detail.respond(answer.catch((err: unknown) => fail('OP_FAILED', messageOf(err))));
  };
  element.addEventListener(APP_OP_EVENT, listener);
  return () => element.removeEventListener(APP_OP_EVENT, listener);
}
