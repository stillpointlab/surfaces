---
created: 2026-11-14T19:40:00-07:00
tags: [formats, dev-tooling, feature, code]
---

# Relative links in a markdown file

In the local host a relative link or image in a markdown file resolves against `/` and is not
found (stage 4 follow-ups, host-page). Context Manager rewrites them for its own pages. The local
host could rewrite a link to `#/file/<path>` and an image to the URL its client gives
(`urlFor`).

What a spec would have to settle (the claude agent's list, not Jamie's):

- where the rewrite lives: in the host, as it is in Context Manager, or in the md format with
  the host supplying the two functions;
- a link to a file in an app's locked files, which opens in its preview;
- remote images, which the local host's content security policy blocks today.
