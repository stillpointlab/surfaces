---
column: todo
# Stamp at creation (ISO 8601 datetime) and keep verbatim.
created: <datetime>
---

# <Area> Review — YYYY-MM-DD

> Full-feature review by an adversarial reviewer: harden and improve the area, and look for seams —
> places where new functionality overlaps with existing systems. Use only the sections that help the
> review; findings are the core — everything else exists to ground them. The `column:` frontmatter
> above drives this file's card on the task board.

Scope: what was reviewed and what was deliberately excluded (e.g. "cross-checked against, but not
re-reviewing, the auth review of YYYY-MM-DD"). Name the entry points, key files, and any design docs
/ ADRs traced.

Overall / Verdict: one paragraph. What is sound, where the problems concentrate, and the single most
important takeaway. State the worst finding's severity up front.

> **Resolution status (YYYY-MM-DD):** _(added post-hoc once findings are addressed)_ map each
> finding ID to the task / PR that resolved it; note any deliberately-accepted risks. Preserve the
> findings below as originally written.

---

## How it works today _(optional)_

Only when the findings need it: a short as-built description of the flow or data model under review,
so each finding can point at a step rather than re-explaining context. Skip for narrow reviews.

## <Coverage map> _(optional)_

For broad/checklist-style reviews (e.g. OWASP Top 10), a table mapping each category to its status —
finding IDs, "sound", or "covered in the <other> review" — so a reader can see what was checked, not
just what failed.

---

## Critical

### C1. <One-line finding title>

- **Where:** `path/to/file.ts:LINE` (and any secondary sites)
- **What:** the defect, precisely. What the code does vs. what it should do.
- **Impact:** who is affected and how bad — the concrete failure scenario.
- **Fix:** the recommended change; reference existing helpers/patterns to reuse.

## High

### H1. <title>

- **Where:**
- **What:**
- **Impact:**
- **Fix:**

## Medium

### M1. <title>

Prose or the Where/What/Impact/Fix shape — whichever is clearer for the finding.

## Low / Hygiene

- **L1 — <title>:** short description + location. Group minor items as a list.

---

## Task list

> Once extracted, add: "Extracted into this phase's `specs/` folder — <links>. The spec docs are
> authoritative; the list below is the original grouping."

Prioritized phases (P0 = correctness/security that stands alone; P1 = hardening; P2 = polish). Each
item as a checkbox referencing the finding ID(s) it closes.

### P0 — <theme>

- [ ] **<finding IDs>:** actionable task description.

### P1 — <theme>

- [ ] ...

## Suggested tests to lock in fixes

- Concrete test cases that would have caught each finding and prevent regression.
