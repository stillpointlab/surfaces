---
column: todo
created: 2026-11-10T14:53:28-07:00
tags: [apps, host-contract, docs]
---

# Spec: the minimum, written down

_The [generic app host brief](../briefs/generic_app_host.md), desired outcome 7. The stage's last
spec: it records what the others leave._

## High-level goal

A Context Manager ADR says how Context Manager hosts an app, and records what still names an app
and why. It covers the app module, the registration, the generic host, the route, the page, create
and check-in, and it is the place to look before adding a third app. The minimum is a list Jamie
has agreed, not whatever happened to be left.

## Related context

- The brief's decision: a per-app registration is the minimum that names each app.
- The ADRs this touches:
  - ADR-0025 (view instances): its adapter seam is now the registration;
  - ADR-0038 (the inventory elements): its page and op answers are now generic;
  - ADR-0028 (mounts, as amended this stage).
- The candidates the [spike](../spikes/generic-app-host.md) listed for the minimum:
  - the registrations and their hooks (`load`, `facts`, `overlay`, `move`, `pages`, `checkin`);
  - tasks' refresh job and PR-state cache;
  - tasks' host ops that write (`resolve`) or scan (`scan-references`), on their own endpoints;
  - the two check-in services, until the shared-core seed;
  - inventory's exports;
  - the two feature flags.

## Technical requirement

- **A new ADR, "Apps through one host"**, answering the brief's last open question. ADR-0025 and
  ADR-0038 get an amendment line each, pointing to it. It holds:
  - the host's five steps;
  - the registration's fields and what each is for;
  - the route and the page;
  - create and check-in;
  - **the minimum:** each item with the reason it stays app-named, and what would move it.
- **"Adding an app" checklist:** export a module from the app's package, add a server and a client
  registration entry, add a flag, and walk it.
- **A count:** lines and files naming an app, before stage 3 (the spike's §1) and after, measured
  the same way.

## Clarifications

- **Written last,** after the specs it records have merged, so it describes what was built.
- **If the stage stops early,** the ADR records the minimum as far as the stage got, and what is
  left goes to the pool.

## Acceptance / completion checklist

- [ ] The ADR is merged in Context Manager, with ADR-0025 and ADR-0038 amended to point to it.
- [ ] Jamie has agreed the minimum it lists.
- [ ] The before and after counts are recorded in it and in the stage changelog.

## Implementation plan

1. Context Manager PR: the ADR and the two amendments.
