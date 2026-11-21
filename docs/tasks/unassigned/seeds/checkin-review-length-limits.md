---
created: 2026-11-20T19:15:00-07:00
tags: [apps, host-contract, polish]
---

# A host gives the check-in review its length limits

The check-in review (`<checkin-review>`) puts no length limit on its title field or its body
field. A host that has limits cannot pass them: the shell's `checkin` input carries the host's
words (`CheckinWords`) and a branch, and neither names a length.

Found when Context Manager adopted the review (context-manager #1242, 2026-11-20). Its old
check-in dialogs stopped the title at 200 characters and the description at 4,000. With the
review, a person can type past both. Context Manager's check-in route then refuses the request
with a 400, and the review shows the refusal under the form with everything kept, so nothing is
lost. The person learns the limit only after pressing the confirm button. Recorded in Context
Manager's stage 7 follow-up log, and moved here because the change is in this repository.

What a spec would have to settle (the claude agent's list, not Jamie's):

- where a limit travels. It is not a word, so `CheckinWords` is the wrong home. A sibling on
  the shell's `checkin` input (`limits: { title?: number; body?: number }`) reaches both apps'
  shells and the review's own input;
- what the review does with one: `maxlength` on the field stops typing with no word of why, and
  a count under the field says more and adds markup;
- the local host, which commits and has no limit of its own: absent means no limit, as now.

Context Manager's side afterwards is one line in each app's shell input, and the route keeps its
own check.

## Also: where focus goes after a refusal, and a pass over the review's display

Added 2026-11-21, from stage 5's follow-up log (checkin-review, step 2). Jamie's ruling on that
entry: a seed is fine, and "I think we need a full pass on the review display". So this seed is
where that pass starts, and the length limits are one item of it.

**Focus after a refusal.** The explorer's commit hands the review a function (`refusalField`), so
a refusal about the branch puts focus on the branch field and one about the message on the
title. An app's shell cannot: which code belongs to which field is the host's knowledge, and
the shell's `checkin` input has no place for it. In an app's review focus goes to the message
line, which is read out, so nothing is lost. The same sibling as the limits would carry it, as
data (`refusalFields: { HOST_BRANCH_EXISTS: 'branch', … }`), since a function cannot cross to a
host that answers over HTTP.

**What a pass over the display would look at** (the claude agent's list, not Jamie's):

- what the host tells the review through a shell, in one place: its words, the branch, the
  default title (#154), the limits, the refusal fields;
- the message line: it is framed in the local host and plain in Context Manager, which has no
  style for `.form-message` (its stage 7 log); it carries `data-code` on a refusal (#154);
- the rows: labels in the host's or the app's words, groups on a stage view, a moved file as
  old → new, and the count;
- the busy state: the spinner and `aria-disabled` buttons (#154), and what a long check-in
  shows while a job runs elsewhere;
- the title: required for a commit, a default for tasks, a placeholder for inventory.
