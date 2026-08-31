# Project Assessment

Status: prototype audit plus stabilization pass, 2026-07-14.

## Executive summary

The prototype proves the central interaction: a technical presentation can be
represented as an execution trace and revealed one source line at a time. A
large fixture used during the audit (later removed from the tree) contained
12,890 steps, 583 visited source lines, 141 Markdown renderings, 28 images,
and 18 links.

The workspace now contains both the static viewer and an installable
Python producer with a compatibility CLI and authoring imports. Snapshot format
version 1 and legacy load-time migration now exist. An authenticated loopback
live transport and file-watched revision reload are implemented. Incremental
streaming, release workflow, and production hardening remain.

The stabilization pass fixed the reproducible MathJax crash, unsafe rich-content
boundary, malformed URL state, incorrect stack ancestry, hard-coded static base,
and repeated full-trace rendering indexes. The remaining architecture work is a
stable serialized identities, Web Worker compile stage, live producer protocol,
and presenter-grade UI. A pure playback engine now owns commands and compiled
navigation/environment indexes.

The correct next move is to extract a pure, tested playback engine over the new
trace contract before expanding features. This preserves the prototype while
making performance work and new renderers safe.

## Evidence collected

| Check | Result |
| --- | --- |
| Production build | Passes |
| Minified JavaScript | 1,013.61 kB across chunks; 74.14 kB of application code on first paint |
| Bundle budget | Passes; only the lazily loaded MathJax runtime is large |
| ESLint | Passes |
| Automated tests | 42 Node tests, 63 producer tests |
| Large English fixture snapshot | 993,769 bytes; 12,890 steps; later removed from the tree |
| Large Russian fixture snapshot | 1,028,590 bytes; 13,211 steps; later removed from the tree |
| English fixture gzip | 54,437 bytes |
| English stack records | 127,681 total; 652 unique frame locations |
| Live browser smoke test | 12,890-step fixture opened with no console errors |

Format version 2 removed the redundancy that dominated the snapshots. The same
English fixture was 30,388,645 bytes and 426,748 bytes gzipped under
version 1, because every one of its 127,681 recorded stack frames was written
out in full even though only 652 are distinct. Storing each distinct frame,
rendering list, and output string once shrank the file 30x, the gzip payload
7.8x, parse time from 46 ms to 4 ms, and retained heap from 31.4 MB to 8.1 MB.

## Audit boundary

This workspace snapshot does not include Git metadata or CI configuration.
The project is licensed under MIT; see `LICENSE`.

## Maturity scorecard

Scores describe readiness for public production use, not the quality of the
core idea.

| Area | Score | Assessment |
| --- | ---: | --- |
| Core concept | 4/5 | Clear and differentiated interaction model |
| Playback features | 3/5 | Navigation, invocation identity, rendering history, and edge cases are tested |
| Reliability | 3/5 | Validated loading, bounded live recovery, and error boundaries exist |
| Performance | 3/5 | Sparse line indexes, selective highlighting, and persistent env deltas are compiled once |
| Presenter UX | 1/5 | URL-only opening, emoji controls, no scrubber, no rehearsal mode |
| Authoring UX | 2/5 | Local Python authoring, generation, presenter diagnostics, and live feedback work |
| Portability | 3/5 | Relative static build and lazy bundled MathJax work offline |
| Accessibility | 2/5 | Named controls and keyboard shortcuts exist; layout still needs work |
| Security | 3/5 | Content is filtered; live roles, bounded queues, CSP, and diagnostic privacy are enforced |
| Maintainability | 2/5 | Core validation/navigation/compilation extracted; view is still large |
| Observability | 0/5 | No performance marks, error reporting, or diagnostic mode |
| Release readiness | 1/5 | MIT license is present; CI, versioning policy, and compatibility contract remain |

## Critical findings

### P0: real presentation can crash during startup

Status: resolved in the stabilization pass.

`index.html` creates `window.MathJax` as a configuration object before the async
CDN script loads. `MarkdownRenderer` checks only that `window.MathJax` exists,
then calls `window.MathJax.typeset()`. At that moment `typeset` may not exist.
Every Markdown line repeats the call and React has no error boundary.

Required outcome:

- Renderer initialization is explicit and awaited.
- Math typesetting is scoped to the changed node and batched once per commit.
- A renderer failure produces an inline fallback, never a blank viewer.
- Offline use does not depend on a public CDN.

All four outcomes are implemented, including lazy bundled MathJax and a browser
test that exercises it under the content security policy.

### P0: trace input has no contract or validation

Status: partially resolved. Schema version 1, legacy migration, runtime
validation, aggregate input limits, and serialized invocation identities are
implemented. Future multi-version migration tooling remains open.

The viewer trusts indices, paths, line numbers, stack arrays, rendering types,
styles, URLs, and environment values. A malformed `step` query parameter or
missing file can cause direct undefined access. There is no schema version or
compatibility policy.

Required outcome:

- A versioned schema is the source of truth.
- Validation runs before playback and returns actionable diagnostics.
- URL state is parsed, normalized, and clamped.
- Unknown optional fields are tolerated according to an explicit policy.

### P0: unsafe rich-content boundary

Status: resolved for the current renderer set. DOMPurify, protocol filtering,
style allowlisting, external-link isolation, and renderer fallbacks are active.

Markdown output is inserted as HTML without sanitization. Trace files can also
provide image and link URLs and arbitrary React style objects. This is unsafe if
community or remote traces are in scope.

Required outcome:

- Sanitize Markdown with a documented allowlist.
- Validate URL protocols and add `rel="noopener noreferrer"` to external links.
- Replace arbitrary style objects with supported presentation tokens or a
  strict style allowlist.
- Define whether traces are trusted, local-only artifacts or untrusted inputs.

### P1: navigation cost grows with trace size

Status: mostly resolved. Reveal, rendering, sparse presentation-line, navigation,
and bounded environment indexes plus selective syntax highlighting are compiled
once. Raw-mode virtualization, Worker compilation, and measured interaction
budgets remain open.

Each step can trigger all of the following work:

- scan all prior steps to compute revealed lines;
- scan all steps to build line renderings;
- scan prior steps to reconstruct the environment;
- syntax-highlight the complete source file;
- create every source-line element;
- remount or update many Markdown renderers;
- request global MathJax typesetting from each Markdown renderer.

Navigation and trace-wide scans have moved out of the interaction path. Rich
mode renders only recorded or rendered lines; very large raw source files still
need virtualization for the desired `O(visibleLines)` DOM cost.

### P1: stack semantics are not reliable

Status: resolved by serialized producer invocation identities, a linear legacy
fallback, and table-driven playback tests covering recursion, unwinding,
repeated locations, repeated calls, and multiple files.

The original helpers compared stack depth and incomplete frame context, so
unrelated and recursive invocations could be confused. They were replaced by
the compiled playback engine and are no longer part of the runtime.

Required outcome:

- Frames have stable identities.
- Ancestor checks compare a frame prefix, not only depth.
- Navigation behavior is defined as pure functions and covered by fixtures.

### P1: renderings are indexed only by line number

Status: resolved by `(path, line)` location indexes and step-versioned rendering
history, with regression coverage for repeated execution of one source line.

The rendering map ignores file paths and overwrites earlier renderings with the
last step that visits a line. Multi-file traces and repeated render states are
therefore ambiguous. The renderer also builds this map from the entire trace,
not from the active presentation state.

Required outcome:

- Locations use `(fileId, line, column?)` identities.
- Render state is indexed by step or represented as explicit state deltas.
- Repeated renderings have deterministic replace/append/remove semantics.

### P1: deployment is repository-specific

Status: resolved. The build uses relative assets, the router accepts arbitrary
static paths, and MathJax is bundled and lazy-loaded.

The build previously hard-coded a repository-specific production base path.
`process.env.NODE_ENV` is not a Vite browser API and currently fails
lint. Browser history routing also requires a server-side fallback.

Required outcome:

- Base URL comes from build configuration, not source code.
- Static hosting, arbitrary subpaths, and offline launch are tested targets.
- Assets are resolved relative to a presentation package.

## Additional correctness and UX issues

- Syntax highlighting is hard-coded to Python.
- The progress indicator is not a seekable control.
- Image alt text is supported by the viewer but missing from the legacy producer
  contract and existing fixtures.
- The environment panel cannot be selected normally because any press starts a
  drag; it has no bounds, resize behavior, persistence, touch, or keyboard path.
- The layout has fixed 800/1000/500 px widths and is not usable on small screens.
- Emoji controls now have accessible names but remain visually inconsistent.
- `stdout` and `stderr` exist in the trace but are not rendered.
- `navigateToUrl` is unused and duplicates `updateUrlParams` behavior.
- Unused Axios and accidental `package.json` dependencies were removed during
  stabilization.
- The README was still the Vite template before this assessment.

## Product gap

The producer already provides a useful code-first authoring seed through
Python functions such as `text`, `image`, and `link`. The remaining product gap
is an integrated authoring loop: file watching, live producer transport, source
diagnostics, revision management, and fast browser updates without manually
regenerating and reopening a JSON trace.
