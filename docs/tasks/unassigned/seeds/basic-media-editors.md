---
created: 2026-11-25T13:40:00-07:00
tags: [formats, feature, host-contract]
---

# Very basic media editors

Jamie, 2026-11-25, at stage 6's opening, on what follows the previews: "very basic editors for
image/video/audio might actually come first so I can do extremely basic media manipulation". A
candidate for stage 7, before or beside the [media manager](media-manager.md).

What the pool already holds:

- [Image editor (basic)](image-editor-basic.md): import, crop, resize, rotate and flip, and a
  source view for SVG.
- [Video editor](video-editor.md): a title and no more.
- Nothing for audio. The [dictation editor](dictation-editor.md) records; it does not edit.
- For a PDF: [a drawn signature](a-drawn-signature-on-a-pdf.md), decided and waiting on bytes
  (Jamie, 2026-11-27), which begins as a mode of the preview and moves to a PDF editor.

What stands in the way today, in both hosts' shared parts:

- **The storage port carries text.** `get` refuses a file that is not UTF-8 or is over 2 MiB, and
  `put` writes text. An editor that saves an image, a clip or a sound needs a way to write bytes.
- **Undo cannot keep such a file.** The local host's journal keeps the text of what it replaces
  or deletes; for a file that is not text it asks first and the step cannot be undone.
- **A format that `needs: 'url'` is given a URL and nothing to write with.** Its descriptor has
  no editor entry today.

The [stage 6 brief](../../stage6/phase1/briefs/media_previews.md) proposes a spike on writing
bytes at that stage's close, so this work can start from an answer.
