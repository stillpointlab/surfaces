---
created: 2026-11-28T03:40:00-07:00
tags: [common, host-contract, dev-tooling]
---

# A test a host runs against its own URL

A format given a URL (an image, an audio file, a video file, a PDF) is handed that address and
no more, and the contract says what the host's server owes there
([root README](../../../../README.md), "What a host's URL owes such a format"; `FormatFile.url`
in `common`): the file's bytes with its content type, an answer to a `Range` request, and a
validator honoured in `If-Range` and `If-None-Match`.

`common`'s testing entry holds an element to its contract (`describeUrlPreviewContract`).
Nothing holds a host's server to its side. So it is kept by each host's own tests, if the host
thought to write them:

- The local host's raw route does all three, by its own tests.
- Context Manager's repository routes sent whole files and no validator until stage 6's phase 5
  ([context-manager#1325](https://github.com/stillpointlab/context-manager/pull/1325)). What
  found it was a read of the routes while the adoption's spec was drafted, and what held the new
  route to the contract was its own tests and a script of the adopting agent's.

## What it would be

A function in `@stillpointlab/common-format/testing` that a host gives a way to ask its route
for a file (an address and a `fetch`, or a function from a request to a response), and that
asks what a player and pdf.js ask:

- the whole file: `200`, its content type, `Accept-Ranges: bytes`, a validator;
- a range from the start, from the middle and to the end: `206` with a `Content-Range` that
  matches the bytes sent;
- a range past the end: `416`;
- `If-None-Match` with the validator: `304`; `If-Range` with an old one: the whole file;
- that the answer is not compressed in a way that breaks a range (Context Manager's compression
  was found to gzip a `206`).

## Why a seed

Jamie, 2026-11-28, at the drain of phase 5's log, on the offer of this test: "seed is fine".
The agent's lean was the same: today the two hosts each have tests of their own that pass, and
a shared test pays when a third route is written (Context Manager's goods that hold bytes, or a
second host).
