# Stage 3: The Generic App Host Reflections

**Date:** _2026-11-12_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- A lot of contention between the agent running in context manager proper and the agent focusing on
  surfaces
- Way too many problems with prisma and it's strict stance on agent's resetting databases. To the
  point I am considering dropping prisma to be honest - it is not up to them to decide what my agent
  can and can't do.
- Still have way too much app code in context manager. This is turning into an endless task where it
  feels like 2 steps forward, 1.9 steps back. There is progress but very slow.

---

## Learnings & reflections

- As annoying as it is to constantly give permission for e2e walks, they have given me more
  confidence that the code changes are good

---

## Agent observations

- _Proposed by claude; Jamie accepts, edits or drops each before it stays._
- (claude) The specs were written in phase 1, before any code, and they held: every phase built what
  its spec said, and each of the 14 departures (two since resolved) was a shape found while
  building, recorded in its spec at the phase close for Jamie's review of the whole stage.
- (claude) Every walk failure this stage was the walk's or GitHub's, not the change's: two fixed
  waits in phase 2, and a GitHub 502 in phase 6 whose merge had in fact landed. Polling made the
  waits steady; the 502 needed a person to close a PR GitHub had left open.
- (claude) Approval for `e2e:reset` and scratch pushes was asked for every walked Context Manager
  PR, and in phase 6 the auto-mode permission check stopped work twice, once even after an OK in
  chat. A standing, narrowly scoped rule would remove the friction; Jamie is weighing the options.

---

## Looking ahead

- Still more work to do to extract apps in a way that feels clean and would be a platform to add new
  apps
