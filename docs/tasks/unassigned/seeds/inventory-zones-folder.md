---
created: 2026-11-10T12:47:26-07:00
tags: [apps, host-contract]
---

# Inventory's `zones/` folder

The code says zone (stage 2 phase 6), but repositories keep their zones in a `rooms/` folder beside
`inventory.yaml`, and Context Manager's routes and API paths say room. Renaming the folder is a
migration across existing repositories: detection reads both folders for a while, and a check-in or
a one-off pull request moves the files. The routes need redirects, and v1's export format keeps its
`room` column. From the stage 2 follow-ups (2026-11-08).
