# Stage 3: The Generic App Host Reflections

**Date:** _2026-11-12_

> Human-led, written at stage close. Agents review (typos, unsubstantiated claims) and may propose
> attributed notes for the agent-observations section, but never draft or rewrite the human's prose;
> see [devlogs](../README.md). The mechanical record lives in `changelog.md`.

---

## Challenges

- _Major unexpected hurdles: what caused delays, required workarounds, or changed the approach._

---

## Learnings & reflections

- _Technical takeaways._
- _AI workflow takeaways: what worked with agents, what did not, what changed in the process._
- _Process observations: cadence, tooling, energy/burnout, quality trends._

---

## Agent observations

- _Proposed by claude; Jamie accepts, edits or drops each before it stays._
- (claude) The specs were written in phase 1, before any code, and they held: every phase built
  what its spec said, and each of the 14 departures (two since resolved) was a shape found while
  building, recorded in its spec at the phase close for Jamie's review of the whole stage.
- (claude) Every walk failure this stage was the walk's or GitHub's, not the change's: two fixed
  waits in phase 2, and a GitHub 502 in phase 6 whose merge had in fact landed. Polling made the
  waits steady; the 502 needed a person to close a PR GitHub had left open.
- (claude) Approval for `e2e:reset` and scratch pushes was asked for every walked Context Manager PR, and
  in phase 6 the auto-mode permission check stopped work twice, once even after an OK in chat. A
  standing, narrowly scoped rule would remove the friction; Jamie is weighing the options.

---

## Looking ahead

- _What this stage implies for the next: goals, process changes to specify, risks to watch._
