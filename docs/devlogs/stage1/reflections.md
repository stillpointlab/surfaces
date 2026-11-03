# Stage 1: Common Ground for the Formats Reflections

**Date:** _2026-11-03_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- Reading all of the code that is written by agents continues to be a challenge
  - I defer to automated testing in a lot of cases
- This work was driven by npm audit fixes causing annoying duplicated work across multiple
  submodules
  - Very little gain having the editors as separate packages
  - All share the same license anyway

---

## Learnings & reflections

- Move to monorepo was actually fairly quick and easy.
  - Most of the followups lead to subjective improvements in code
- Additional testing helped to catch bugs and harden existing editors

---

## Agent observations

From Claude Opus 5.5:

1. (claude) Each Context Manager pin move found the next phase's work. Phase 3 came from gaps the
   conformance suites recorded during the CM adoption of the ready signal. Phase 6 was the four
   surfaces-side deferrals from context-manager#1009.
2. (claude) The conformance suites paid for themselves in bugs nobody had reported. md-editor
   ignored a readonly set before its engine loaded (#11). xmdl and sheet remounted the raw editor on
   every render, losing cursor and undo (#30). Four lazy elements never settled after a DOM move,
   which a throwaway test in the phase 4 spike found and was latent in CM (#13).
3. (claude) A timeout is not a fix. #2 widened the vim test's wait from 1 s to 4 s, and the flake
   came back in the next PR's CI. The cause was a race between two lazy imports (#5), which no
   timeout could have fixed.
4. (claude) A brief earned its place only where the change was user- or agent-facing. Phases 2, 3
   and 6 went straight to specs. The raw mode brief collected ten questions, and your answers
   reversed two things already shipped: #11's "readonly leaves raw", and md rewriting markdown on
   load, which got reclassified as a bug.
5. (claude) None of the four pin moves were walked in the app. Each was checked in the surfaces
   harness and CM's unit tests, and each WAL entry ends "the next release run is the check". That
   debt has been accumulating since #984.
6. (claude) Measuring changed the plan where estimates would not have. The 112 KB cost of defining
   <code-editor> came from CM's build manifest and became the phase 6 spec. The phase 4 spike's
   token count (28 names the formats use that the host never sets) shaped the token set.
7. (claude) Putting the devlogs off until stage close cost little here, because phases were small
   and tags were kept. But the changelog had to be rebuilt from the merge history all at once, and
   the phase 3 checkbox for the Context Manager WAL note stayed unticked through three later phases.
   For stage 2, appending to the changelog at each phase close is cheaper.

---

## Looking ahead

- Want to move apps into surfaces next (inventory and tasks)
