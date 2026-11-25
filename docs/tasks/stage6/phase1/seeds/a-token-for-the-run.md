---
column: todo
created: 2026-11-22T20:20:00-07:00
tags: [local-host, security]
---

# A token for the run

The local host's request checks stop a browser on another origin, which is what they were written
for: a `GET` needs nothing, and a write needs an `Origin` header. A program can set that header.
The [stage 5 release review](../../../stage5/phase7/reviews/stage-5-release-review.md) (H3) read the
ruling behind this, in the [host-server spec](../../../stage4/phase2/specs/host-server.md): "a
program on the same machine can already write the files".

That holds for a program running as the same person with no sandbox. It does not hold for
another account on the machine, a container on the host's network, or a sandboxed agent that can
reach loopback. Each can read every file under the served folder, and with the header write
files and call `POST /api/commit`, which runs the repository's hooks as the person serving. Stage
5 widened what is behind the door: the commit, the apps' ops and undo.

**Jamie's ruling, 2026-11-22:** build it, in phase 1 of the next stage.

## What it is

A random token made at each start of the server, required on every `/api/` request, and known
only to the page the command's printed address opens.

## To settle in the spec

- **How the page gets it.** In the printed address (a fragment or a query the page reads once,
  keeps, and takes out of the address bar), or a cookie the first page load sets. A fragment is
  not sent to the server or kept in its log; a cookie needs `SameSite=Strict` and still leaves
  the event stream and `fetch` to carry it.
- **Where it travels.** A header on `fetch`. `EventSource` and the raw route's `<img src>` cannot
  set one, so those need the cookie, or the token in their query.
- **A reload and a second tab.** Both must keep working: the page keeps the token where a reload
  finds it (`sessionStorage` does not reach a second tab; a cookie does).
- **The dev mode** (`dev.js`, the page served by Vite) and every test's request helper take it
  too.
- **What a request without it gets:** 403, with words that say to open the address the command
  printed.
- **The `Origin` and `Host` checks stay.** The token is one more check, not a replacement.

## Not in it

A password, accounts, or TLS. The server still listens on loopback only.
