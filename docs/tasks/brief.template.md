---
column: todo
# Stamp at creation (ISO 8601 datetime) and keep verbatim.
created: <datetime>
# Optional metadata (ADR-0020): blocked: <reason> | completed: <date> | pr: <number|url>
---

> A brief captures the _why_ and the desired outcome before any task breakdown exists. Keep it short
> — one page. Specs derived from it live in the sibling `specs/` folder, built from
> `spec.template.md`. The `column:` frontmatter above drives this file's card on the task board.

## High-level goal

What outcome should exist when this work is done, in one or two sentences?

## Background

Why now? What prompted this — a review finding, a user need, a follow-up? Link related ADRs,
reviews, or prior task docs.

## Desired outcome

What does "done" look like from the user's (or operator's) point of view?

## Constraints

Hard requirements, non-goals, and anything the implementation must not break.

## Open questions

Decisions that need an owner before or during task breakdown.
