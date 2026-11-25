---
column: in-progress
created: 2026-11-25T17:00:00-07:00
tags: [local-host, security, code]
---

# Spec: a token for the run

_From the seed [a token for the run](../seeds/a-token-for-the-run.md), which Jamie ruled into this
phase on 2026-11-22 (the stage 5 release review's H3). One PR here. His three rulings on it are
under "Decision"._

## High-level goal

The local host answers only someone who has the address its command printed. Today a `GET` needs
nothing and a write needs an `Origin` header, which any program can set. After this, another
account on the machine, a container on its network or a sandboxed agent that reaches loopback is
refused on every route.

## Related context

- Follow-up to: the [host-server spec](../../../stage4/phase2/specs/host-server.md), whose
  ruling this replaces ("a program on the same machine can already write the files"), and the
  [stage 5 release review](../../../stage5/phase7/reviews/stage-5-release-review.md), H3.
- Main files: `packages/hosts/local/src/server/host.ts` (`createRequestCheck`, `createHost`),
  `cli.ts` (the printed address), `dev-page.ts` (development mode), `respond.ts` (refusals), the
  page's notices, the package's README and the
  [release walk](../../../unassigned/tests/local-host-release-walk.test.md).
- Read with: the [streaming spike](../spikes/a-video-player-that-streams.md). What phase 3 adds
  (a `<video>` with range requests, hls.js fetching segments, pdf.js fetching a file) are all
  requests the page's own code does not write, and the token has to reach them.

## What was tried

On 2026-11-25, on the spike's scratch server, in Chromium 158 and Firefox 159, with the token in
a cookie set by the first page load:

| Case                                                                                | Result                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The address without the token, in a browser that has no cookie                      | 403                                                         |
| The printed address                                                                 | redirected to the address without the token; the page loads |
| A second tab, opened at the address without the token                               | loads                                                       |
| `<video>` and `<audio>` on a file, the event stream, hls.js's playlist and segments | all carry the cookie, none refused                          |
| Another server on `127.0.0.1` at another port, visited in that browser              | is sent the cookie                                          |
| The same visited as `localhost`                                                     | is sent nothing                                             |

No request the page makes had to be changed. The fifth row is the cost: a cookie belongs to a
host name and not to a port.

## Technical requirement

### 1. The token

- `runCli` makes it at each start: 32 random bytes from `node:crypto`, written as base64url.
- `HostOptions` gains `token: string | null`. `null` turns the check off and has to be written
  out: a desktop shell that serves the handler under a scheme of its own, and the tests that are
  not about the token.
- The command prints the address with it, and `RunningCli.url` is that address:
  `Serving <root> at http://127.0.0.1:5190/?token=<token>`.

### 2. The exchange

A `GET` or `HEAD` for the page (any path outside `/api/`) with `token` in its query:

- the right token answers `303` to the same path and query without `token`, and sets
  `surfaces-<port>=<token>; HttpOnly; SameSite=Strict; Path=/`. The port in the name lets two
  runs on two ports each keep their own;
- a wrong one answers `403` as below, and sets nothing.

### 3. The check

After the three checks `createRequestCheck` makes today, which stay as they are, every request
on every route has to carry the token:

- as the cookie above, or
- as `Authorization: Bearer <token>`, for a program and for the tests.

The comparison takes the same time whatever the token sent (`timingSafeEqual` over buffers of one
length).

A request without it answers `403` with the code `HOST_TOKEN_REQUIRED`:

- under `/api/`, as the JSON refusal every other one is, with the message "Open the address the
  `surfaces` command printed in its terminal.";
- for the page, a plain page with the same words and nothing about the folder served.

Nothing is exempt: the page's files, `/api/events` and `/api/raw` are behind it too.

### 4. Development mode

`createDevPage` holds what Vite serves to the same check, the exchange included, as it does for
the other three today. The upgrade that carries Vite's reloads is held to it too.

### 5. The page

- No request changes: the browser sends the cookie.
- A page left open across a restart holds the old run's cookie. When a call answers
  `HOST_TOKEN_REQUIRED`, or the event stream fails and a `GET /api/root` answers it, the page
  shows one notice that stays: "This page's server was started again. Open the address its
  terminal printed." It does not go on retrying the stream.

### 6. The words

- The package's README gains a section on who the host answers: the token, where it travels, and
  "What it does not stop" as below.
- The release walk gains four steps: the address without the token is refused; `curl` without it
  is refused on `/api/list`; a second tab opens; a page left across a restart says so.

## What it does not stop

- **A program running as the same person, unsandboxed.** It can read the folder itself.
- **Another server on `127.0.0.1` that the person visits in the same browser while the host
  runs.** The browser sends that server the cookie, and with it a program can call the host. The
  token is new at each start, and a visit to `localhost` at another port is sent nothing.
- **Anything on the wire.** There is no TLS, and the server listens on loopback alone.

## Non-goals

- A password, accounts or TLS (the seed's "Not in it").
- A change to the `Host`, `Origin` and `Sec-Fetch-Site` checks.
- A flag to turn the token off from the command line.
- The raw route's address by path and its range requests: phase 2's groundwork.

## Decision

Jamie, 2026-11-25, on the three rulings this spec asked for:

1. **A cookie.** The other way was a header: the page would read the token from the address,
   keep it in `localStorage` (which is kept for one port) and set it on each `fetch`. Nothing
   else can set a header, so the event stream, every `<img>`, `<video>` and `<audio>`, each
   segment hls.js asks for and each range pdf.js asks for would have carried the token in its
   address, and every format that loads a file would have had to be given it.
2. **The cross-port point is accepted:** "that is fine, local host is trusted enough". It is
   written in the README. Jupyter's notebook server makes the same trade.
3. **The page's own files are behind the token too.** They hold no secret; behind it, a person
   without the token meets the words that say what to do and not a page that fails.

## Acceptance / completion checklist

- [ ] A request with no token is refused with `HOST_TOKEN_REQUIRED` on `/`, a page asset,
      `/api/list`, `/api/file`, `/api/raw`, `/api/events`, a `PUT /api/files` and
      `POST /api/commit`.
- [ ] The printed address loads the page, and the address the browser then shows has no token.
- [ ] A wrong token in the address is refused and sets no cookie.
- [ ] The cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, and named for the port.
- [ ] `Authorization: Bearer` with the token is accepted, and with a wrong one refused.
- [ ] A request another origin starts is still refused by the checks before the token's, with
      the token or without.
- [ ] `createHost({ token: null })` answers with no token.
- [ ] Development mode: the same refusals for what Vite serves.
- [ ] A page left across a restart shows the notice and stops retrying.
- [ ] By hand, on the built server, in Chromium: an image, a markdown file, a tasks board, a
      commit and an undo all work from the printed address; a second tab works.
- [ ] README and the release walk card updated; `npm run check` passes.

## Implementation plan

1. `createRequestCheck` takes the token and makes the fourth check; the exchange is in
   `createHost`'s page branch; `HOST_TOKEN_REQUIRED` joins `respond.ts`.
2. `runCli` makes the token and prints the address; `createDevPage` passes the check through.
3. The page's notice, in `host-client.ts` and the page shell.
4. Tests: the server's request helpers send `Authorization`; the host's own tests pass
   `token: null` except the new ones.
5. README, the release walk card, the by-hand pass.

### Work package

- **Owns:** `packages/hosts/local/`, and the release walk card.
- **Must not change:** `packages/common/` and the format and app packages.
- **Runs beside:** the phase 2 specs, which are written while this is built.

## As built

Built by an Opus 5.5 sub-agent, read and checked by the orchestrating agent, which added the
last point of the first list.

Where the build differs from the plan:

- **The exchange is in `createRequestCheck`,** not in `createHost`'s page branch, so development
  mode gets it from the same function. The check's answer is now a refusal, the exchange's
  redirect, or `null`; `createHost` and `createDevPage` send whichever it gives.
  `createRequestCheck(origin, token)` takes the token as a second argument, and `createDevPage`'s
  options gain it.
- **A token in a query is the exchange and nothing else.** `/api/list?token=<the token>` is
  refused. A wrong token in the page's address is refused even when the request also carries
  the right cookie.
- **Development mode checks an upgrade without its query.** Vite's reload socket has a `token`
  of Vite's own in its address, which would have been read as a wrong one. The upgrade still
  needs the cookie, the right `Host` and an `Origin`.
- **The comparison is over SHA-256 digests,** which are one length whatever was sent. Every
  value carried is compared (several cookies of the name, and a `Bearer`).
- **The cookie's name is `surfaces` alone** where the origin has no port.
- **The plain page is `text/plain`,** the words and a new line. The code is in the JSON refusal
  only.
- **`RunningCli.url` is the existing `Serving.url`.** No field was added.
- **The redirect keeps one leading slash.** `//elsewhere/?token=<the token>` would have been
  answered `Location: //elsewhere/`, which a browser reads as another host. It took the right
  token to get that answer.

How the page learns of a restart:

- Every call goes through one function that reads the code of a `403`. On the stream's failure
  the client asks `GET /api/root`, one check at a time.
- The first `HOST_TOKEN_REQUIRED` closes every stream for good and tells the page once
  (`{ type: 'restarted' }`, the client's own event). The page's notice then stays: no close
  button, and no later notice replaces it.

Checked:

- The full check of the tip, in CI: 3,695 tests. The sub-agent ran `npm run check` from a clean
  tree before the review's one fix: 3,694.
- By hand in Chromium on the built server: the address without the token (the words alone); the
  printed address (the page, and no token left in the address); an image; a markdown file saved;
  a tasks board; a commit; a create and its undo; a second tab; a `fetch` without the cookie;
  a restart on the same port (the notice, and no stream request after it, a hidden and shown
  tab included); the new address in the same tab.
- `curl`: `/api/list` without the token and with `Authorization: Bearer`; the exchange with the
  right token and a wrong one.
- Development mode: the refusals for the page, a source file and Vite's client; the exchange;
  the reload socket connecting with the cookie.

Not tried:

- Firefox, for the host itself. The cookie's travel was tried there on the spike's server.
- The printed address followed from a link on another site. The cookie is `SameSite=Strict`, so
  the page after the redirect is most likely refused until it is loaded again.
- An app's op from a board after the exchange. The commit, the create and the undo are writes
  that carried the cookie.

A latent fault in `dev-page.test.ts` was fixed on the way: its refusal cases built their `Host`
before the port was known, so each asked as `evil.example:undefined`.
