# Stage 2: The Apps Breakout Reflections

**Date:** _2026-11-10_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- Moving all of the apps out of CM into surfaces is more work than anticipated
  - It has gone through 2 phases so far but is far from complete
- Prisma has some strict rule about agents running dangerous CLI that leak into every single session
  - I have to approve e2e:reset many times
- Coordination between an agent doing refactoring work (removing all db ids from public visibility)
  and an agent doing the apps extraction was a bit annoying
  - I should find a way to allow the agents to coordinate between them (I know this is possible)

---

## Learnings & reflections

- I think there was benefit to the app move in that it forced some decoupling that will benefit the
  apps long term
  - This will only really show over time, when new features are added
- As much as I disliked the process of creating the e2e walks, having them gave me significantly
  more confidence in the move
  - I think I need to learn the balance between when to add these walks. For features that have
    mostly solidified I think the ability to find regressions using this kind of walk is a benefit
  - I still don't want to add them to CI since they take some time to run

---

## Agent observations

- (claude) Every Context Manager adoption after the prep (#1019) was walked, and when a walk failed,
  the cause was the setup or the walk script, never the code: a stale build, a server left on the
  port, a dialog host Playwright never counts as visible, and a race in walk 03.
- (claude) Splitting tasks' rules into three steps, each a surfaces PR plus a walked Context Manager
  adoption, kept every PR reviewable. "The core decides before the host writes" changed Context
  Manager's behaviour only in small, named ways, such as refusals no longer linking a file first.
- (claude) Moving the harness onto the cores exposed a rule bug the host had been working around: a
  pending move hid the paths a card had passed through, as well as its old path.
- (claude) The two lines of work met in one walk: Context Manager's folder public ids (#1098) landed
  in the middle of tasks-rules step 3, and that step's first walk failed on a build from before
  them.

---

## Looking ahead

- I plan to continue the push to remove the apps completely from CM
  - This must include some kind of generic interface that all apps can use
  - The highest level goal is "no mention of inventory or tasks in CM" but that bar is probably too
    high. I want to aim for some reasonable minimal.
