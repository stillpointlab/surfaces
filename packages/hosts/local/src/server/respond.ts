// How the server answers: JSON with the security headers, a refusal's status by
// its code, and a request's body read under the size limit. Shared by the host's
// routes (`host.ts`) and the app routes (`apps/`).

import { MAX_BODY_BYTES } from './limits';

import type { Failure } from '@stillpointlab/common-format/app';

/**
 * The HTTP status for a refusal's code: not found, a conflict, or anything else.
 *
 * A git failure is 422 and not 500. The repository is the person's, not the
 * server's: a hook that refuses, an identity not set, a signing key that fails
 * are theirs to put right, and the server cannot tell those from any other
 * failure of git's.
 */
export function statusFor(code: string): number {
  switch (code) {
    case 'HOST_FILE_NOT_FOUND':
    case 'HOST_APP_NOT_FOUND':
    case 'HOST_APP_PAGE_NOT_FOUND':
      return 404;
    case 'HOST_PATH_EXISTS':
    case 'HOST_FILE_CHANGED':
    case 'HOST_NOT_A_REPOSITORY':
    case 'HOST_GIT_NOT_FOUND':
    case 'HOST_NOT_CHANGED':
    case 'HOST_PATH_CONFLICTED':
    case 'HOST_GIT_IN_PROGRESS':
    case 'HOST_DETACHED_HEAD':
    case 'HOST_BRANCH_EXISTS':
    case 'HOST_BRANCH_MOVED':
    case 'HOST_SCOPE_LOCKED':
    case 'HOST_APP_INVALID':
    case 'HOST_APP_OVERLAP':
    case 'HOST_NOTHING_TO_RESOLVE':
    case 'HOST_NOTHING_TO_UNDO':
    case 'HOST_NOTHING_TO_REDO':
    case 'HOST_UNDO_CONFLICT':
    case 'HOST_CANNOT_UNDO':
      return 409;
    case 'HOST_TOKEN_REQUIRED':
      return 403;
    case 'HOST_GIT_FAILED':
      return 422;
    case 'HOST_WRITE_FAILED':
      return 500;
    default:
      return 400;
  }
}

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

/**
 * A refusal's body: its code and message, and the two fields the journal's
 * refusals carry when they have them: `reason` (why a step cannot be kept) and
 * `path` (the file an undo met changed).
 */
export function refusal(failure: Failure, status = statusFor(failure.code)): Response {
  const { reason, path } = failure as Failure & { reason?: unknown; path?: unknown };
  return json(
    {
      ok: false,
      code: failure.code,
      message: failure.message,
      ...(typeof reason === 'string' ? { reason } : {}),
      ...(typeof path === 'string' ? { path } : {}),
    },
    status
  );
}

export function refuse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return json({ ok: false, code, message }, status, headers);
}

/** What every request without the run's token is told, on every route. */
export const TOKEN_REQUIRED = 'Open the address the `surfaces` command printed in its terminal.';

/**
 * The refusal of a request without the run's token: under `/api/` the JSON
 * refusal every other one is; for the page (any other path) a plain page with
 * the same words, so a person who has lost the address meets what to do, and
 * nothing about the folder served.
 */
export function tokenRequired(api: boolean): Response {
  if (api) return refuse('HOST_TOKEN_REQUIRED', TOKEN_REQUIRED, 403);
  return new Response(`${TOKEN_REQUIRED}\n`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS },
  });
}

/** A request's body as text, refused past `MAX_BODY_BYTES`. */
export async function readBody(request: Request): Promise<string | Response> {
  if (!request.body) return '';
  const declared = Number(request.headers.get('content-length') ?? '0');
  const tooLarge = () =>
    refuse('HOST_BODY_TOO_LARGE', `The body is over ${MAX_BODY_BYTES / 1024 / 1024} MiB.`, 413);
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A request's body parsed as JSON, or the refusal. */
export async function readJson(request: Request): Promise<{ body: unknown } | Response> {
  const text = await readBody(request);
  if (text instanceof Response) return text;
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return refuse('HOST_BAD_REQUEST', 'The body is not JSON.', 400);
  }
}
