# Trace snapshot format

## Compatibility

`schema/trace.schema.json` is the source of truth for snapshot format version 2.
Every snapshot MUST declare `formatVersion`. Version 1 is not supported: it is a
different physical layout, and the viewer rejects it with an explicit error.
Convert old snapshots once with `node scripts/convert-trace-v1-to-v2.mjs`.

Readers MUST ignore unknown fields in a supported format version. Writers MUST
not change the meaning of an existing field without incrementing the version.

## Version 2 layout

Recorded stacks repeat heavily: a 12,890-step reference presentation contains
127,681 stack frames drawn from only 652 distinct ones, and 169 distinct
rendering lists. Version 2 therefore stores each distinct value once and lets
steps refer to it by index.

| Field | Meaning |
| --- | --- |
| `files` | Presentation-relative path to UTF-8 source text |
| `frames` | Every distinct stack frame, in first-seen order |
| `renderings` | Every distinct rendering list, in first-seen order |
| `outputs` | Every distinct `stdout`/`stderr` string |
| `presentationSteps` | Strictly increasing raw step indexes for audience-facing playback |
| `steps` | One `[frameIndexes, renderingsIndex, stdoutIndex, stderrIndex, env]` tuple per step |

`frameIndexes` runs from the outermost caller to the active frame, so the last
entry is the active frame. `env` stays inline on the step: it is a small delta
and rarely repeats.

`steps` is the complete execution trace and can revisit the same source lines
inside loops. `presentationSteps` is the sparse, linear playback track: normal
next/previous navigation follows it, while source mode can still traverse every
raw event. A presentation scope is a source function that produces at least one
non-note rendering. Writers include the first visit to each line in those
scopes, plus every visit that produces a rendering. This keeps authored Python
lines in order, waits for called computation to finish, and removes loop
repetitions and internal helper frames. Readers derive the same track when the
field is absent; rendering-free debugger traces fall back to every step.

Measured against the version 1 encoding of the same reference presentation:
30.4 MB to 0.99 MB on disk, 427 kB to 43 kB gzipped, 46 ms to 4 ms to parse, and
31.4 MB to 8.1 MB of retained heap.

The viewer expands a document into per-step objects but shares one object per
table entry, so the retained graph holds the distinct frames rather than one
object per recorded frame.

## Version 2 identities

A source location is identified by `(path, line_number)`. A frame is identified
during compilation by its stack prefix plus `(path, function_name)`. These are
derived at compile time rather than serialized. Table indexes are a storage
detail and carry no playback meaning: two identical frames recorded at unrelated
points share one index by design.

Rendering lists are complete rendering state captured at a step. Version 2 does
not define incremental rendering operations. Live protocol deltas are a separate
versioned contract and compile into this snapshot model.

## Files and assets

`files` maps portable presentation-relative paths to UTF-8 source text. A frame
that is active in at least one step MUST have its path in `files`; caller frames
from outside the presentation may be absent. Asset URLs are resolved relative to
the presentation/player URL and are still subject to the viewer security policy.
`traceviewer validate` and `traceviewer pack` treat non-HTTP image URLs as local
assets, reject traversal outside the configured asset root, and require each
referenced file to exist.
