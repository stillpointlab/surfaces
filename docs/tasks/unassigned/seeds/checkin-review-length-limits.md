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
