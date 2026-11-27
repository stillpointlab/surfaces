---
created: 2026-11-25T16:20:00-07:00
tags: [formats, feature, host-contract]
---

# Streams from beyond the folder

Stage 6 plays a stream whose playlist and segments lie in the folder. Jamie, 2026-11-25: "local
playlists for now with plans for server, CM in the future". The
[streaming spike](../../stage6/phase1/spikes/a-video-player-that-streams.md) named three other
places a stream can come from, each a larger step:

- **Another server:** a playlist that points at a CDN or a camera on the network. Both hosts'
  policies refuse it today. In the spike `connect-src 'self'` stopped hls.js's fetch and
  `media-src 'self'` stopped the browser's own. Opening a policy to an origin is a ruling for
  each host, and the question of which origins comes with it.
- **The host cutting a stored video into a stream.** Server work, in Context Manager most of all:
  a large good is cut and kept as segments, and its page is given a playlist. Until then a large
  file is served with range requests.
- **Live video,** from the webcam and GoPro work. The same element, given a source that has no
  end.

## Since

- **Jamie, 2026-11-26,** ruling phase 3's log: "we should handle playlists from other servers
  one day", and it "might fit more in with when we add CM support to the electron app that gets
  built on the harness - so maybe a far-off concern".
- **What stage 6 does with one today:** the policy refuses it and the video preview says
  "Couldn't load this video." The HLS build found hls.js asking again for 31.6 s first, with 14
  policy reports; its retries are capped in phase 3's follow-ups, so the sentence comes in
  seconds.
