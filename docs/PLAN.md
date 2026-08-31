# Engineering Plan

## Goal

Turn the proof of concept into a pleasant, open, portable tool for creating and
delivering live step-by-step presentations, without losing the directness of the
current trace-based interaction.

## Confirmed product direction

1. The player is a static web application.
2. The player connects to a running producer and can replay received steps.
3. Presentations from other authors are untrusted input.
4. Authoring is code-first with a fast hot-reload loop.
5. The `producer/` Python package is the producer source of truth, with
   `text`, `image`, and `link` helpers as the initial authoring API.
6. Existing JSON traces remain importable while the live protocol is added.

Engineering defaults still to confirm: supported browsers, maximum trace size,
and whether a fully offline player is required in addition to static hosting.

## Engineering principles

- Preserve a small, inspectable open format.
- Separate trace semantics from React and browser APIs.
- Make playback deterministic before adding authoring features.
- Treat presenter latency and failure recovery as product features.
- Keep renderers explicit, sandboxable, and independently testable.
- Make performance budgets executable in CI.
- Prefer progressive enhancement: the basic presentation remains readable when
  optional rich renderers fail.

## Target architecture

The initial target can remain one deployable web application while enforcing
module boundaries:

```text
Presentation package
  - manifest
  - versioned trace
  - source files
  - local assets
        |
        v
Loader -> validator/migrator -> trace compiler (Web Worker)
                                      |
                                      v
                               immutable playback index
                                      |
                 +--------------------+--------------------+
                 |                    |                    |
          playback engine       renderer registry     diagnostics
                 |                    |                    |
                 +--------------------+--------------------+
                                      |
                                      v
                              React presenter shell
```

Suggested source boundaries:

```text
src/
  app/                 routing, startup, error boundaries
  trace/
    schema/            versioned types, validation, migration
    load/              URL, file, drag/drop, package loading
    compile/           indexes and worker protocol
  playback/            pure state machine and navigation commands
  renderers/           text, code, markdown, math, image, link
  presenter/           stage, toolbar, timeline, notes, diagnostics
  shared/              small generic utilities only
```

Package extraction into a monorepo should wait until there is a real second
consumer such as a CLI, editor, or embeddable player. Module boundaries are
enough for the stabilization phase.

## Live transport and hot reload

The static player should depend on a `TraceSource` interface, not directly on
HTTP JSON or WebSocket APIs:

```ts
interface TraceSource {
  connect(): Promise<void>;
  subscribe(listener: (event: TraceEvent) => void): () => void;
  close(): void;
}
```

Initial adapters:

- `SnapshotTraceSource`: existing JSON/file/URL playback;
- `LiveTraceSource`: authenticated WebSocket connection to the local producer.

Protocol events should be append-oriented and versioned: `hello`, `manifest`,
`file_snapshot`, `file_update`, `step_append`, `execution_reset`, `diagnostic`,
`complete`, and `error`. The player must validate every event before applying
it. Reconnection uses a session ID and monotonic sequence number.

Hot reload should preserve the current semantic location when possible. A file
change starts a new execution revision; the player keeps the previous revision
until the new one is valid, then maps `(path, function, line/anchor)` to the new
timeline. The producer must never expose an unauthenticated execution endpoint
to the network by default: bind to loopback, use a random session token, and
validate browser origins.

## Work plan

### Workstream A: establish the contract

1. Write `trace.schema.json` with an explicit `formatVersion`.
2. Define frame identity, location identity, render-delta semantics, and asset
   resolution.
3. Build a legacy importer for the two existing traces.
4. Validate before entering playback; report exact paths and expected values.
5. Add size and complexity guards to protect the browser.

Deliverable: malformed input never reaches playback state, and both fixtures
load through the same public contract.

### Workstream B: extract a pure playback engine

1. Represent commands: next, previous, step-over, step-out, seek, follow-link.
2. Build stable frame IDs and prefix-correct stack relations.
3. Precompute next/previous navigation targets.
4. Precompute revealed-location and environment deltas.
5. Keep URL serialization as an adapter outside the engine.

Deliverable: navigation is covered by table-driven tests without React or a DOM.

### Workstream C: make rendering safe and resilient

1. Add application and per-renderer error boundaries.
2. Sanitize Markdown and validate links, image sources, and style tokens.
3. Bundle the math renderer and initialize it explicitly.
4. Batch node-scoped math rendering; never run a global typeset per line.
5. Define a typed renderer registry with loading, error, and fallback states.
6. Add image alt text and deterministic layout dimensions to the format.

Deliverable: one invalid renderer produces a visible diagnostic placeholder and
does not interrupt presenter navigation.

### Workstream D: move cost out of the interaction path

1. Parse and compile traces in a Web Worker.
2. Intern repeated strings and frames in the next trace format.
3. Index renderings by location and step; stop scanning all steps in React.
4. Highlight each source file once and import only required languages.
5. Virtualize large source files or render a bounded window.
6. Memoize stable line components and update only changed presentation state.
7. Lazy-load optional renderer code and media.
8. Add performance marks for load, compile, first render, navigation, and seek.

Deliverable: step navigation remains within budget on a 100k-step reference
trace and does not create work proportional to total trace size.

### Workstream E: design the presenter experience

Minimum presenter shell:

- open by file picker, drag/drop, URL, or recent presentation;
- large next/previous controls and configurable shortcuts;
- seekable timeline with step and section markers;
- presenter mode and clean audience mode;
- source/rich view toggle with clear state, not emoji-only controls;
- resizable and dockable environment/inspector panel;
- rehearsal diagnostics for missing assets and broken links;
- fullscreen, wake lock, and recovery of the last local step;
- help overlay listing active shortcuts;
- reduced-motion and high-contrast support.

The current URL query format can remain shareable, but it should not be the
primary user interface.

### Workstream F: add authoring after playback stabilizes

Recommended product direction: a code-first source format with instant preview,
then an optional visual editor over the same abstract presentation model.

Possible authoring layers:

1. A human-readable source format for sections, steps, code locations, notes,
   renderings, and assets.
2. A Python API/decorator layer for users who want execution-derived traces.
3. A CLI that validates, previews, packs, and exports presentations.
4. A browser editor only after the format and CLI prove stable.

Do not make the recorded runtime trace the only editable source of truth. It is
large, difficult to review, and unsuitable for Git conflict resolution.

## Proposed presentation package

Use an open directory layout during development and an optional zip-compatible
single-file package for distribution:

```text
presentation/
  manifest.json
  presentation.json
  sources/
  assets/
```

`manifest.json` should include format version, title, locale, entry point,
required renderer capabilities, integrity metadata, and optional attribution.

The compiled trace may use normalized JSON first. A binary encoding should be
introduced only after profiling proves parsing or memory still misses budgets.
Keep the canonical schema and migration tools independent of encoding.

## Performance budgets

Budgets should be tested on a documented mid-range laptop and in a production
build. Initial targets:

| Metric | Target |
| --- | ---: |
| Core application JS | <= 250 kB gzip |
| Optional renderer chunks | Lazy-loaded; <= 150 kB gzip each |
| First usable UI without a trace | <= 1 s |
| 30 MB legacy trace load + compile | <= 2 s, with visible progress |
| Next/previous input-to-paint p95 | <= 16 ms |
| Arbitrary seek input-to-paint p95 | <= 50 ms |
| Long task during playback | No task > 50 ms |
| Memory for 100k-step compiled fixture | <= 200 MB |
| Layout shift after entering presenter mode | Near zero |

Budgets are provisional until the minimum supported device and maximum trace
size are confirmed.

## Quality strategy

### Unit tests

- query parsing and serialization;
- schema validation and migration;
- stack identity and ancestor relations;
- all navigation commands, including recursion and exceptions;
- reveal-state and environment-delta compilation;
- rendering policy and sanitizer fixtures.

### Integration tests

- legacy snapshot imports;
- multi-file traces and repeated locations;
- offline package loading;
- missing/invalid assets and renderer fallback;
- browser back/forward behavior;
- keyboard and pointer navigation.

### End-to-end and visual tests

- open, present, seek, follow links, toggle views, recover state;
- Chromium, Firefox, and WebKit at supported desktop sizes;
- at least one narrow viewport and reduced-motion mode;
- visual snapshots for Markdown, math, code, image, link, and environment states.

### CI gates

- format, lint, typecheck, unit, integration, and production build;
- bundle size budgets;
- schema backward-compatibility fixtures;
- performance smoke test with a generated large trace;
- dependency and license audit.

## Immediate implementation order

Completed in the stabilization pass:

1. MathJax readiness, application boundary, and per-renderer fallback.
2. Clean lint, Node tests, and real-trace browser smoke test.
3. Safe URL parsing and legacy trace validation.
4. Pure, tested stack relations and navigation functions.
5. One-time reveal/rendering indexes and source highlighting.
6. Sanitized Markdown, URLs, and style allowlists.
7. Relative static build assets and arbitrary route matching.

Next implementation order:

1. Continue decomposing the presenter shell, timeline, and inspector from
   `TraceViewer.jsx` over the extracted renderer registry.
2. Add rehearsal state, timer, bookmarks, and a dockable stdout/stderr/stack
   inspector.
3. Move validation and compilation into a Web Worker with visible progress.
4. Add generated 10k/100k-step fixtures and enforce interaction budgets.
5. Introduce lazy chunks for optional renderer families and languages where
   bundle measurements justify them.
6. Define and implement the portable presentation package.
7. Add CI, release automation, and artifact upload after the product workflow
   and package contract stabilize.

## Decisions required before feature expansion

- Maximum supported trace/source/media sizes.
- Required languages, browsers, and accessibility level.
- Whether fully offline playback is required in addition to static hosting.
- Whether the live producer must support remote hosts or loopback only for 1.0.
