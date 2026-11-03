---
column: todo
created: 2026-11-03T12:38:46-07:00
tags: [apps, host-contract, code]
---

# Result types for app cores

Result types are Jamie's preferred pattern for failures (2026-11-03, on PR 36): a function returns
`{ ok: true, … } | { ok: false, code, message }` and never throws for a rule the input breaks. The
apps breakout moves the cores as-is, so for now their pure modules throw error classes they own
(`InventoryRuleError`, `TasksRuleError`) and Context Manager maps them back to its own errors
([cm-app-prep](../../stage2/phase2/specs/cm-app-prep.md)). Some core functions already return results
(`parseInventoryManifest`, the lifecycle's `validateAndScope`).

Convert the throwing functions to results when the contract is named (the brief's phase 5), so
`AppModule`'s `apply` and its typed refusal start from one pattern; the host then maps a result's
`code` instead of catching. Worth a shared `Result` type in `common` if both apps converge on the
same shape.
