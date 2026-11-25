---
created: 2026-11-25T16:20:00-07:00
tags: [formats, feature]
---

# MPEG-DASH streams

Stage 6's video preview plays HLS and no other streaming format. Jamie, 2026-11-25: MPEG-DASH is
deferred for now.

What the [streaming spike](../../stage6/phase1/spikes/a-video-player-that-streams.md) found for
it:

- No browser plays an `.mpd` alone.
- Two libraries played one in Chromium and Firefox, with a seek, under the same page policy HLS
  needs: Shaka Player's DASH build (214 kB minified and gzipped) and dash.js (258 kB; the npm
  package is `dashjs`).
- It would be a second engine behind the interface the video package gives hls.js, loaded only
  when an `.mpd` is opened.
