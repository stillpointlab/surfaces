---
created: 2026-11-25T13:40:00-07:00
tags: [apps, feature, major-feature]
---

# A media manager

Jamie's [stage 5 reflections](../../../devlogs/stage5/reflections.md) name two new apps to start
on: a character creator and a media manager. On 2026-11-25, at stage 6's opening, he made the
media manager the likely theme of stage 7, to be looked at again when stage 6 closes. It would
sit on the previews stage 6 builds (PDF, audio and video, beside image). He also said that
[very basic media editors](basic-media-editors.md) might come before it.

What it does is not written yet. This seed holds the place and what is known around it:

- It would be the third app, and the first that was not moved out of Context Manager. That
  repository's ADR-0040 (decision 9) lists what adding an app takes there, and several rows of
  its "what still names an app" table say a third app is what would show whether they can move.
- By the [placement test](../../../../packages/apps/README.md#placement-test) it is an app if its
  unit of work is a folder, and a format if it is a file.
- An app writes through the storage port, which carries text of up to 2 MiB. Whatever the app
  keeps about a media file is text beside it; the media itself reaches a page as a URL.

To write before a spike: what a person does with it, in Jamie's words.
