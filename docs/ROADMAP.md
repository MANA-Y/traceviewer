# Product and Engineering Roadmap

This roadmap is ordered by dependency and risk. Calendar estimates should be
added only after team size, target platforms, and authoring scope are confirmed.

## North-star outcome

A presenter can create, validate, rehearse, package, and deliver a step-by-step
technical presentation on any supported machine. Playback is instant, offline,
recoverable, and safe. The file format and core player remain open and usable
without a hosted service.

Adoption work is sequenced in
[ADR 0001](adr/0001-standalone-authoring.md): a talk is a standalone
directory, authors do not need Node.js, and the canonical import is
`from traceviewer import ...`. Engine milestones below stay valid but are
deferred until that author path works from a wheel.

## Milestone 0: product contract and baseline

Purpose: remove ambiguity before architecture hardens.

Scope:

- Decide the primary authoring model.
- Define supported runtime targets and minimum browsers/devices.
- Define trusted versus untrusted presentation behavior.
- Locate and document the current trace producer.
- Capture baseline load, playback, bundle, and memory measurements.
- Adopt a license, contribution policy, and initial compatibility policy.
  MIT is in `LICENSE`; contribution and compatibility policy remain.

Exit criteria:

- Product decisions are recorded as short ADRs.
- A reference presentation and a generated stress presentation are versioned as
  compatibility fixtures.
- Performance measurements are reproducible with one command.

## Milestone 1: reliable viewer

Purpose: make the existing concept safe for an uninterrupted demonstration.

Scope:

- Fix MathJax initialization and bundle offline math support.
- Add application and renderer error boundaries.
- Normalize URL state and handle missing/out-of-range steps.
- Add legacy trace validation with clear error UI.
- Fix stack ancestry and step navigation semantics.
- Sanitize Markdown, URLs, and styles.
- Remove lint errors and accidental dependencies.
- Add smoke and navigation tests to CI.

Exit criteria:

- Both included traces complete a scripted playback smoke test without console
  errors or blank-screen failures.
- Invalid trace fixtures produce diagnostics and never crash the app.
- Build, lint, and tests pass in CI.

## Milestone 2: stable playback core

Purpose: create a foundation that can support new UI and authoring tools.

Status: in progress. The pure command engine, derived identities, navigation
targets, location lookup, and environment deltas are implemented. Serialized
identities, explicit rendering deltas, and broader compatibility fixtures remain.

Scope:

- Publish trace schema version 1 and migration rules.
- Extract a pure playback state machine.
- Introduce stable file, frame, location, and rendering identities.
- Define explicit rendering delta semantics.
- Compile navigation, reveal, environment, and rendering indexes once.
- Add multi-file and recursive-call fixtures.

Exit criteria:

- React components contain no stack-navigation or trace-search algorithms.
- Playback engine tests cover forward, backward, over, out, seek, recursion,
  exceptions, repeated lines, and multi-file traces.
- Existing traces import without content regressions.

## Milestone 3: performance and scale

Purpose: keep interaction latency independent of presentation size.

Status: in progress. Validation and trace compilation run in a module Web
Worker. Python, Dart, Bash, and diff language definitions load on demand, as
does the optional structured-renderer family. Large-source virtualization,
generated performance fixtures, memory measurements, and CI budgets remain.

The math renderer now uses a base-only modular MathJax CHTML runtime. Its lazy
JavaScript payload is about 160 kB gzip (down from about 705 kB), with offline
WOFF fonts fetched only when the rendered symbols require them.

Scope:

- Move validation and compilation to a Web Worker.
- Normalize repeated trace records and add compressed package delivery.
- Highlight code once and load languages on demand.
- Virtualize large sources and lazy-load rich renderers/media.
- Memoize stable UI and render only state deltas.
- Add timing, long-task, memory, and bundle budgets to CI.

Exit criteria:

- 100k-step fixture meets the budgets in `PLAN.md`.
- Next/previous playback does not scan the trace or complete source file.
- The main thread remains responsive while a large trace is loading.

## Milestone 3.5: live producer and hot reload

Purpose: connect the static player to code-first authoring without coupling the
playback engine to one transport.

Status: functional vertical slice complete. Snapshot and WebSocket `TraceSource`
adapters, protocol v1, loopback token/origin security, checkpoint reconnection,
dependency watching, atomic incremental revisions, semantic position mapping,
and last-valid recovery are implemented. True during-execution streaming and
production-scale backpressure remain.

Scope:

- Define the versioned `TraceEvent` protocol and `TraceSource` interface.
- Add a loopback-only authenticated WebSocket server to the Python producer.
- Stream file snapshots, appended steps, diagnostics, completion, and resets.
- Add reconnection with session IDs and sequence checkpoints.
- Watch authoring sources and publish execution revisions.
- Preserve the current semantic location across valid revisions.
- Show explicit connected, running, stale, failed, and complete states.

Exit criteria:

- Editing a `text`, `image`, or `link` call updates the static player without a
  manual browser reload.
- A broken revision leaves the last valid presentation playable and reports a
  source diagnostic.
- Unknown, reordered, oversized, or unauthenticated events are rejected.

## Milestone 4: presenter-grade UX

Purpose: make live delivery calm and predictable.

Status: in progress. Responsive desktop/mobile presentation and presenter
views, speaker notes, seekable sections, shortcut help, audience following, a
rehearsal timer, and a tabbed variables/stack/stdout/stderr inspector exist. A
dockable/resizable shell, bookmarks, persisted rehearsal state, and full
accessibility pass remain.

Scope:

- Landing/open flow for file, drag/drop, URL, and recent items.
- Audience stage, presenter toolbar, and fullscreen mode.
- Seekable timeline, sections, bookmarks, and rehearsal notes.
- Dockable inspector for environment, stack, stdout, and stderr.
- Shortcut help, remapping, pointer/touch controls, and focus management.
  Pointer here includes a live laser the presenter can move; it is ephemeral
  live state, not a snapshot field. See `docs/PRESENTATION_GENRES.md`.
- Responsive layout, reduced motion, high contrast, and screen-reader labels.
- Local recovery of the last step and safe reload behavior.

Exit criteria:

- A presenter can operate the complete demo without constructing a URL.
- The audience view contains no authoring or diagnostic chrome.
- Core presenter flows pass keyboard-only and screen-size test matrices.

## Milestone 5: authoring and packaging

Purpose: make presentation creation reproducible and pleasant.

Status: in progress. `new`, `build`, `live`, `serve`, `dev`, `validate`, and
`doctor` are implemented. Portable packages, deterministic export validation,
and cross-platform distribution remain.

Scope:

- Define a reviewable authoring source format above the compiled trace.
- Provide a CLI for `new`, `validate`, `dev`, `pack`, and `export`.
- Add live preview with precise source diagnostics.
- Add a Python adapter for execution-derived presentations if code-first
  authoring is confirmed.
- Package all required assets for offline playback.
- Generate deterministic output suitable for Git and CI.

Exit criteria:

- A new user can create and run the reference presentation from documented
  commands without editing generated JSON.
- A package can be copied to another supported machine and presented offline.
- Validation identifies broken locations, links, assets, and unsupported
  renderer capabilities before rehearsal.

## Milestone 6: open ecosystem and 1.0 release

Purpose: make the tool sustainable beyond the initial prototype.

Scope:

- Document the renderer extension API and security model.
- Publish format, player, CLI, and migration documentation.
- Add example presentations and starter templates. Genre candidates and the
  order to introduce them are in `docs/PRESENTATION_GENRES.md`.
- Establish semantic versioning and deprecation windows.
- Add signed release artifacts, changelog automation, and support matrix.
- Run accessibility, security, and performance release audits.

Exit criteria:

- Version 1 presentations have a documented compatibility guarantee.
- Third parties can build a renderer without importing internal application code.
- Release artifacts pass offline, cross-browser, security, and performance gates.

## Cross-cutting backlog

These items belong to the earliest milestone that needs them:

- localization of player chrome and presentation metadata;
- speaker notes, timers, and remote presenter control;
- export to static HTML/PDF/video where semantics allow;
- embeddable player API;
- content-addressed asset cache;
- presentation analytics only as explicit, privacy-preserving opt-in;
- import adapters for Markdown or notebook-based workflows;
- optional collaboration/editor service without making it a playback dependency.

## Explicit non-goals for the stabilization phase

- A full visual editor before schema and playback semantics stabilize.
- Arbitrary JavaScript execution inside presentation renderers.
- A mandatory cloud account or backend.
- A binary-only proprietary presentation format.
- Premature framework or monorepo migration without a measured need.
