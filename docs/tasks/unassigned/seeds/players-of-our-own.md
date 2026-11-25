---
created: 2026-11-25T16:20:00-07:00
tags: [formats, feature, polish]
---

# Players of our own for video and audio

Stage 6's video and audio previews use the browser's own controls. Jamie, 2026-11-25, ruling on
the [streaming spike](../../stage6/phase1/spikes/a-video-player-that-streams.md): "we can use
browser for now as long as that is compatible with hls.js", with a seed for "our own video and
audio players (these will likely be separate)".

What the browser's controls do not give:

- **A choice of quality** when a stream offers several. hls.js reports the levels and takes a
  choice; the browser's controls have nowhere to show one.
- **One look in every browser and both schemes.** Each browser draws its own, and none reads the
  `--spl-*` tokens.
- **The same keys everywhere,** and a speed control where a browser has none.

The spike's first draft put a small set drawn by us in the stage: play, a seek bar, the time,
sound, full screen and the quality choice. Whether the two players share those as a helper in
`common` or a package under `components/` was left to a spec.
