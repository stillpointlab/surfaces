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

- _Attributed notes proposed by agents during the stage and accepted by the human, e.g.
  `(claude) The docs PR review caught a spec bug before the process merged.` Unmarked prose never
  appears here._

---

## Looking ahead

- I plan to continue the push to remove the apps completely from CM
  - This must include some kind of generic interface that all apps can use
  - The highest level goal is "no mention of inventory or tasks in CM" but that bar is probably too
    high. I want to aim for some reasonable minimal.
