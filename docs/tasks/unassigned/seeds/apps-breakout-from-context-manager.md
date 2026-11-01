---
column: todo
created: 2026-11-01T15:32:34-07:00
tags: [apps, host-contract, major-feature]
---

# Apps breakout from Context Manager

Tasks and inventory move out of Context Manager's `src/` into `packages/apps/` behind the
source-agnostic contract the platform architecture names as the strategic critical path. The
contract extracted for them is the same one MCP binds to. Sheet is the stress test for holding the
contract at good granularity; if it can live with propose-whole-good plus its own cell-level diff,
the contract is right.
