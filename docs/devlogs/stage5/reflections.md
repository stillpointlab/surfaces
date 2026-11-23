# Stage 5: The Apps in the Local Host Reflections

**Date:** 2026-11-22

---

## Challenges

- Builds sometimes being failed for resource contention reasons
- Managing two agents working on the same project from different primary focus points
  - sometimes hard to know which agent is responsible for overlapping issues
- Large followup drain effort at stage end
  - Phases followups were carried over to stage end

    | Logged in                                                                           | Entries | Fixed  | Closed with a reason | Seed  | Carried |
    | ----------------------------------------------------------------------------------- | ------- | ------ | -------------------- | ----- | ------- |
    | Stage 4, phase 2 (the local host's page, tree, file operations, format descriptors) | 13      | 12     | 1                    | 0     | 0       |
    | Stage 4, phase 3 (git in the host)                                                  | 5       | 4      | 1                    | 0     | 0       |
    | Stage 4, phase 4 (Context Manager adopts the formats)                               | 1       | 1      | 0                    | 0     | 0       |
    | Stage 5, phase 1 (setup)                                                            | 1       | 1      | 0                    | 0     | 0       |
    | Stage 5, phase 2 (app module, app shells, host runner)                              | 26      | 17     | 4                    | 4     | 1       |
    | Stage 5, phase 3 (apps in the local host)                                           | 9       | 3      | 4                    | 2     | 0       |
    | Stage 5, phase 4 (check-in review)                                                  | 10      | 7      | 1                    | 2     | 0       |
    | Stage 5, phase 5 (undo)                                                             | 6       | 5      | 1                    | 0     | 0       |
    | Stage 5, phase 7 (the drain itself)                                                 | 1       | 1      | 0                    | 0     | 0       |
    | **Total**                                                                           | **72**  | **51** | **12**               | **8** | **1**   |

---

## Learnings & reflections

- Drain followups per phase
  - Set a limit on how many carried forwards (1-3?)
- Save stage end for adversarial review and user validation
  

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

---

## Looking ahead

- Need to decide between
  - start on additional formats (e.g. image, pdf, audio, video)
  - start on new apps (e.g. character creator, media manager)
  - continue moving apps remnants out of Context Manager
