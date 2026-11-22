---
created: 2026-11-22T16:30:00-07:00
tags: [common, hosts, context-manager, spike]
---

# Context Manager on the runner

`common-format/host` has one runner for an app's op (`runOp`, `projectView`, `createInstance`,
`loadInstance` in `packages/common/src/host/runner.ts`), written against the storage port and
nothing else. The harness and the local host run on it. Context Manager does not: it runs its
own `AppHostService` (`src/services/apps/appHost.ts` there), which the runner's steps were read
from. The host-runner spec records why the runner is in `common`: "because the harness uses the
same runner and Context Manager running on it is the end state". Adoption was out of stage 5's
scope.

Jamie, 2026-11-22, ruling two of stage 5's follow-ups: a seed, and "I suspect I'll want CM to
adopt the runner but need more info". This seed is where that information is gathered. What
follows is the claude agent's reading of the two hosts at that date, not a plan Jamie has
agreed.

## What the two share, and what Context Manager adds

The runner is the steps both hosts take: bound the op, load the instance, apply the core op,
check every change is the instance's, write, and answer from the instance loaded again.
Context Manager's `runOp` takes the same steps, and between the check and the write it also:

- **links a file on its first change** (its ADR-0023), then loads again and applies the op a
  second time, so each draft carries the linked version as its base;
- **writes drafts**, one file at a time, each against a base kept by good;
- **lays its own ids over the reply** (`overlay`), after the module has answered.

The runner has no place for the first: nothing runs between its check and its `put`.

## What is known to be missing

Two entries from stage 5's follow-up log (host-runner, 2026-11-14), moved here. The first
held two points:

- **`createInstance` does not know of a create that was cut off half way.** Context Manager
  seeds a create's files one at a time, so an attempt can die after the manifest and before
  the instance exists; a retry passes `reusable` (that attempt's own files) to the module's
  `placeCreate`. The runner passes `taken` alone. The local host cannot be cut off: its create
  is one all-or-nothing `put`.
- **`createInstance` does not check the new instance against the others.** Each host does it
  before calling: the local host refuses with `HOST_APP_OVERLAP`, Context Manager with
  `VIEW_SCOPE_OVERLAP`.
- **A `revision` covers the scope's files and not the listing.** A state that reads the listing
  beyond the scope would not show as stale. The local host joins the runner's revision with a
  digest of the uncommitted changes in the instance's folder, so it moves there. A host on the
  runner's revision alone has the gap.

## What a spike would answer

Whether Context Manager's storage can be a `StoragePort` (`list`, `get` with a version, an
all-or-nothing `put`, `status`), and what the runner must gain if it can:

- **`put` is all or nothing; drafts are written one at a time.** Either Context Manager's port
  makes its writes one transaction, or the runner learns of a partial write (which is also the
  cut-off create above).
- **Where linking goes.** Inside the port's `put`, which hides a second load and a second apply
  from the runner, or a step the runner offers a host between its check and its write.
- **Versions and bases.** The port's `version` and its `HOST_FILE_CHANGED` against a draft's
  base version by good: whether they are the same check.
- **`know`.** The runner asks the host for facts once per load. Context Manager's loader also
  takes the op and what was just written (`load(written)`), which `know` does not carry.
- **Refusals.** The runner answers results with a refusal class; Context Manager throws
  `ApiError`s with a status. `refusalStatus.ts` there already maps a class to a status.
- **The port's conformance suite** run over that port: each case it cannot pass is a finding.

## What adoption would buy

- **One set of steps, checked once.** The scope check exists twice today: the runner's
  `outOfScope` is a copy of Context Manager's `checkChanges`, and a change to one is not a
  change to the other.
- **A smaller generic host.** Context Manager's ADR-0040 counts its generic host at 1,887
  lines; `appHost.ts` is 559 of them, and its `runOp`, `project` and `create` follow the
  runner's steps.
- **A third host is checked against what Context Manager runs**, not against a sibling of it.

## What it would cost

- A port over drafts and goods is new code with its own faults, in the host people use today,
  to replace code that works.
- The runner gains whatever the spike finds (a linking step, a partial write), and the harness
  and the local host carry that without using it.

## Read with

- [host-runner](../../stage5/phase2/specs/host-runner.md), with its "As built" section.
- Context Manager's ADR-0040 (apps through one host) and its seed
  `work-in-surfaces-host.md`.
