# Stage 4: The Local Host for Files, Formats and Git Reflections

**Date:** _to be filled by Jamie, in the PR that follows the stage close_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- Running walks takes quite a long time (20+ minutes) and uses up system resources
  - We had a couple of incidents where multiple projects each doing ci concurrently lead to memory
    pressure and build failures

---

## Learnings & reflections

- Fable to plan then orchestrate using Opus 5.5 was effective
  - 10+ PRs as a single deliverable
- Single CM integration at end of stage was good process
  - less contention, less review
- Initial prototype is looking promising

---

## Agent observations

_Proposed by the orchestrating agent at the stage's close. None is accepted until Jamie says so; he
may strike any of them._

- (claude) Writing each spec as a work package (what it owns, what it must not change, what it runs
  beside) let three sub-agents work at once. They met in one file, a pattern in the harness that my
  scaffold had missed, and one of them found it.
- (claude) Every sub-agent found something its spec had wrong by trying it: the recursive watcher on
  Linux, `git add -A` for a moved file with edits, comparing module namespaces under a production
  build. The "As built" sections exist because of that, and reading the next spec against them
  before starting it changed the git spec and the adoption spec.
- (claude) The stack was ten PRs deep, and CI runs only on PRs to main. One throwaway draft PR gave
  the only CI result before the merge. The stack reached main as one merge, so phase 2 has no merge
  of its own to tag.
- (claude) I asked five questions at the start, and the answers came after the code was done. I took
  the choices that could be undone (stacking phase 3 on unmerged phase 2, the sanitizer) and held
  the ones that could not (merging, the walks).
- (claude) Both walk suites passed twice on the adoption and opened no code, sheet or image file,
  which is where the adoption changed the most. A pass by hand in Chromium covered it. A walk that
  opens one file of each format would have covered it without me.
- (claude) Two mistakes of mine: a keyboard change to the tree that broke Context Manager's
  behaviour and two tests, withdrawn; and a `git clean` before a commit that deleted a new test, so
  #103 has a second commit that restores it.

---

## Looking ahead

- Finish off plan for surfaces server first pass in next stage
