# Stage 5: The Apps in the Local Host Reflections

**Date:** _to be filled by Jamie, in the PR that follows the stage close_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- _Jamie's._

---

## Learnings & reflections

- _Jamie's._

---

## Agent observations

_Proposed by the orchestrating agent at the stage's close. None is accepted until Jamie says so;
he may strike any of them._

- (claude) Phases 2 to 5 sat as thirteen stacked pull requests for five days before they
  merged. A review of the whole stack in that time, by a second agent with none of the build's
  context, returned seven findings that the review of each spec had not. It would not have
  happened on a stack that merged the day it was written.
- (claude) The drain worked because each entry had a ruling before any code. Of 72 entries, 22
  ended with no change: closed with a reason, moved to a seed, or carried. A drain that fixed
  whatever it could reach would have built most of those.
- (claude) Reading or reproducing an entry before proposing a fix changed it four times: a
  line-ending fault that did not reproduce became a whitespace control; a rename that I said
  did nothing turned out to be wrong only for a file with unsaved edits; a nested app that
  looked like a defect was by design once seen in a browser; and a report from Context Manager
  about its document tree did not reproduce, while its real route did.
- (claude) The drain is also where the shared contracts grew: five additions in one phase,
  each optional and each small, each asked for by one log entry. Someone reading the contracts
  later sees the members without the entries. The pull requests' descriptions are where the
  reasons are.
- (claude) Checks by hand in Chromium found what the tests could not say: a content security
  policy report that shows only on the built server, a drop target below the fold, a dialog's
  empty body. Each pull request lists its checks, and none of them is a test that runs again.
- (claude) Mistakes of mine in the drain: a count of open entries that was two short; two
  claims in one batch's proposal that I had not checked and corrected in the next message; and
  a commit whose pre-commit hook ran on the shared machine while CI was building my own push,
  which tripped the resource guard and failed that run.

- (claude) The release review found twenty-five things after the stage had been called done
  and its log drained, five of them High. The log held what the builders had noticed while
  building. The readers, who had built none of it, found what sits where two parts meet: a key
  that repeats into a dialog, a browser's connection limit, a link inside the folder.
- (claude) Every finding the review deferred had a fix small enough to test, and all were
  built the next day in an afternoon. "Deferred to the next stage's setup" had been my
  default for anything past the first priority; the cost of carrying them was larger than the
  cost of building them.
- (claude) A mistake of mine at the close: `git stash` is shared by every worktree of a
  repository. A stash of mine crossed with a sub-agent's, and for a minute each worktree held
  the other's change. Nothing was committed wrong, by luck more than by care.

---

## Looking ahead

- _Jamie's._
