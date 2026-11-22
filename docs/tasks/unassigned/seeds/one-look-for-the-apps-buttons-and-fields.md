---
created: 2026-11-22T14:45:00-07:00
tags: [apps, common, hosts, polish]
---

# One look for the apps' buttons and fields

The app elements and `<checkin-review>` render in light DOM and take their buttons' and form
fields' looks from eight classes their host must style: `.button`, `.button-primary`,
`.button-secondary`, `.form-field`, `.form-label`, `.form-input` (with `aria-invalid="true"`),
`.form-help` and `.form-message`. The elements' own stylesheets only place them.

Each host writes those rules again:

- **Context Manager** has them in its own styles (`src/client/styles/_forms.scss` for the
  fields); the classes are its names.
- **The local host** wrote its own in `packages/hosts/local/src/client/page.scss`.
- **The harness** has three sets of stand-ins: `packages/apps/inventory/dev/host.css`,
  `packages/apps/tasks/dev/shell.css` and `packages/components/checkin-review/dev/host.css`,
  about 240 lines together.

A third host would write them a fourth time, with nothing to check them against: the classes
are listed in READMEs, and no test fails when a host leaves one out.

From stage 5's follow-ups (phase 2's read for phase 3). Jamie, 2026-11-22: a seed.

## What a task would decide

How much of a host's look the apps own. The two ends (the claude agent's framing, not Jamie's):

- **A shared partial in `common`'s styles**, beside the tokens: one set of rules for the eight
  classes, which the local host and the harness use and Context Manager may or may not. Every
  host looks the same with no work. A host with its own buttons (Context Manager) either gets
  two definitions of `.button` on one page or does not use the partial, and then it is not
  shared.
- **The apps keep borrowing, and the contract says what is borrowed.** The list of classes
  moves from READMEs to one place a host can check itself against (a conformance check that
  each class has a rule, or a harness page that shows every borrowed class). Hosts keep their
  own look; the cost of a new host stays.

Between them: the partial as a default the local host and the harness take, with the classes
still a host's to restyle, which removes the three stand-ins without touching Context Manager.

## Read with

- [A dark scheme pass](dark-scheme-pass.md): the same rules need a dark form, once per host
  today.
- [How the icons are made](how-the-icons-are-made.md) and
  [the host's words in an app](the-hosts-words-in-an-app.md): the other places where an app
  takes something from its host.
- [Check-in review length limits](checkin-review-length-limits.md), which holds the pass over
  the review's display: the review is the heaviest user of these classes.
