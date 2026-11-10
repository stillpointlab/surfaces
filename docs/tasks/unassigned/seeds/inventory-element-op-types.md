---
column: todo
created: 2026-11-10T12:47:26-07:00
tags: [apps, code]
---

# Typed inventory element ops

The inventory elements' ops carry an item and its changes as `Record<string, unknown>`; the harness
casts them to the core's `AddInventoryItemInput` and `UpdateInventoryItemInput`. Typing them means
the element's form code builds those inputs. A natural part of a stand-alone inventory host. From
the stage 2 follow-ups (inventory-rules, 2026-11-09).
