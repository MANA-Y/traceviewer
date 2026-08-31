# Current Code Map

This document maps the current prototype as implemented. It is descriptive,
not the target architecture.

## System boundary

```text
Python presentation -> producer/capture -> JSON trace
                                          |
URL query state                            |
    |                                     |
    v                                     v
React Router -> TraceViewer ----------> validated loader
                         |             |
                         |             +-> embedded source files
                         |             +-> recorded steps/stacks/env deltas
                         |             +-> Markdown/images/links
                         |
                         +-> source-line view
                         +-> draggable environment panel
                         +-> URL updates for navigation
                         +-> lazy bundled MathJax
```

There is no required backend for snapshot playback. Vite serves the application,
public assets, and example traces. The Python producer writes JSON traces and
provides an authenticated, role-separated loopback live transport.

## Repository map

| Path | Responsibility | Notes |
| --- | --- | --- |
| `index.html` | HTML shell and browser security policy | CSP and no-referrer policy |
| `src/main.jsx` | React root | Strict Mode enabled |
| `src/App.jsx` | Router setup | Catch-all route supports arbitrary static paths |
| `src/TraceViewer.jsx` | Loading, async compilation state, playback composition, and presenter interactions | Presenter and renderer implementations extracted |
| `src/ErrorBoundary.jsx` | Application and renderer failure isolation | Prevents blank-screen failures |
| `src/core/trace.js` | Version 2 validation, table expansion, and complexity limits | Shares one object per distinct frame across steps |
| `src/core/playback.js` | Pure commands, derived identities, and playback indexes | Navigation source of truth |
| `src/sources/traceSource.js` | Snapshot and reconnecting WebSocket adapters | Transport boundary |
| `src/sources/protocol.js` | Runtime validation for live events | Protocol version 1 |
| `producer/src/traceviewer_producer/live.py` | Authenticated loopback server and revision watcher | Optional WebSocket dependency |
| `src/core/compileTrace.js` | One-time playback, source, reveal, and rendering indexes | Pure compiler used by worker and test fallback |
| `src/core/traceCompiler.js` / `traceCompiler.worker.js` | Off-main-thread validation and compilation | Module Worker with non-browser fallback |
| `src/core/urlState.js` | Safe query parsing and step clamping | Keeps browser input outside playback logic |
| `scripts/convert-trace-v1-to-v2.mjs` | One-off rewrite of pre-version-2 snapshots | Not used by the producer |
| `scripts/pack_source.py` | Portable source zip for another host | Writes `dist/traceviewer-source.zip` |
| `docs/BUILD.md` / `docs/AUTHORING.md` | Host rebuild and presentation authoring | User-facing; README links both |
| `src/rendering/security.js` | Markdown, URL, and style security policy | Uses DOMPurify and explicit allowlists |
| `src/rendering/mathjax.js` / `mathjax-runtime.js` | Serialized, node-scoped base-TeX to CHTML integration | Lazy 160 kB gzip runtime; local WOFF fonts load on demand |
| `src/rendering/languages.js` | Path detection and async syntax highlighting | Python, Dart, Bash, and diff load on demand |
| `src/rendering/renderers.jsx` | Core Markdown, code, media, and link registry | Eagerly imports structured renderers |
| `src/rendering/structuredRenderers.jsx` | Tables, charts, timelines, graphs, callouts, columns, metrics, terminal, diff, and sections | Same bundle as `renderers.jsx` |
| `src/presenter/` | Timeline, settings, speaker notes, optional notes console, rehearsal timer, and step inspector | Presenter deck controls; `view=notes` is optional |
| `src/presentationSettings.js` | Persisted text scale, images, step highlight, line numbers, heading pin, and section scroll | Same localStorage pattern as theme |
| `src/utils.js` | URL helper and `getLast` | URL helper is unused |
| `src/index.css` | Complete viewer styling | Fixed-width desktop layout |
| `src/App.css` | Root spacing | Vite-template residue |
| `public/var/traces/*.json` | Generated snapshots | Only `presentations.example.json` is tracked |
| `vite.config.js` | Build configuration | Production base is repository-specific |
| `eslint.config.js` | JavaScript and React lint rules | Lint passes |
| `dist/` | Generated production bundle | Local build output; gitignored |
| `producer/` | Installable Python capture and authoring package | Unified producer source of truth |
| `producer/src/traceviewer_producer/development.py` | One-command viewer plus live producer orchestration | Powers `traceviewer dev` |
| `producer/src/traceviewer_producer/validation.py` | Dependency-free snapshot contract diagnostics | Powers `traceviewer validate` |
| `producer/src/traceviewer_producer/doctor.py` | Local authoring environment checks | Powers `traceviewer doctor` |
| `schema/trace.schema.json` | Canonical snapshot format version 1 | Shared producer/viewer contract |
| `fixtures/contracts/` | Minimal cross-runtime contract fixtures | Compatibility tests |
| `src/core/playback.js` | Pure commands, stable derived IDs, navigation targets, location and environment indexes | Playback source of truth |
| `execute.py` | Legacy-compatible producer CLI entrypoint | Delegates to the package CLI |
| `execute_util.py` | Legacy authoring imports | Preserves existing presentation imports |
| `presentations/example.py` | Minimal code-first example | No extra runtime dependencies |

## Producer flow

1. The CLI imports a presentation module and requires a callable `main()`.
2. `sys.settrace` records line events only for the presentation source module.
3. `@inspect name` annotations capture selected values after a line executes.
4. `text`, `image`, and `link` append renderings to the active capture buffer.
5. Optional Torch/SymPy values are serialized without importing those libraries
   into the producer itself.
6. The CLI writes the existing `{files, steps}` JSON shape for viewer compatibility.

## Runtime flow

### 1. Bootstrap

`main.jsx` mounts `App` in React Strict Mode. `App` creates a
`BrowserRouter` and renders `TraceViewer` for the root route.

### 2. Query parsing

`TraceViewer` reads browser query parameters directly on every render:

| Parameter | Meaning |
| --- | --- |
| `trace` | URL of the JSON trace |
| `source` | Source path for direct line navigation |
| `line` | Target line number |
| `step` | Target trace step |
| `raw` | Show source instead of rich renderings |
| `animate` | Cloak lines not yet revealed; on by default, `0`/`false` turns it off |

The URL is the only persisted playback state.

### 3. Trace loading and compilation

An effect uses abortable native `fetch` and counts actual streamed bytes. A
module Web Worker validates the object, enforces aggregate complexity limits,
and compiles playback indexes before the revision enters React state. Cache,
detailed progress, and schema negotiation remain pending.

### 4. Current location derivation

The component derives the active step, active stack element, source path, and
line from `step`, or searches for a step matching `source` and `line`. When no
target is supplied, step zero is selected.

### 5. View derivation

`compileTrace` builds revealed-location, step-versioned rendering, navigation,
and sparse presentation-line indexes once after load. Environment deltas use
bounded persistent checkpoints. Rich mode creates elements only for recorded or
rendered lines; raw source mode still creates an element for every source line.

### 6. Navigation

Buttons and global keyboard handlers call navigation helpers. Each helper writes
new query parameters through React Router, causing view derivation and rendering
to run again.

## Function map

### Application and state

| Function | Responsibility | Key dependencies |
| --- | --- | --- |
| `App` | Router and route setup | React Router, build base |
| `TraceViewer` | Fetch, worker compilation state, URL state, active step, global input, composition | Trace source, playback, presenter shell |
| `updateUrlParams` | Merge a parameter delta into browser query state | `window.location`, router navigation |
| `navigateToUrl` | Alternative URL merge helper | Unused |

### Playback navigation

| Function | Responsibility | Complexity today |
| --- | --- | ---: |
| `transition` | Apply next, previous, over, out, or seek | O(1) after compilation |
| `compilePlayback` | Build identities, targets, locations, and environments | O(steps x stack depth) per revision |
| `findLocationStep` | Resolve directional source navigation | O(visits to one location) |
| `runPlaybackCommand` | Adapt a pure command result into URL state | O(1) |
| `gotoLine` | Adapt indexed location lookup into URL state | O(visits to one location) |
| `OpenTracePicker` | Open a local JSON snapshot, URL, or recent item | Replaces the browser prompt |

### Trace and frame helpers

| Function | Responsibility | Risk |
| --- | --- | --- |
| `getLast` | Return final array item | Returns undefined for an empty stack |
| `getLocation` | Build `path:line` string key | String collision is possible; no column or frame state |
| `getFileId` / `getLocationId` | Build stable derived file/location identities | File/location IDs remain derived |
| `compilePlayback` | Use serialized invocation IDs with a linear legacy fallback | O(steps x stack depth) |
| `compileTrace` | Build playback, source, reveal, and rendering indexes | O(trace size) once per loaded revision |

### Rendering

| Function/component | Responsibility | Risk |
| --- | --- | --- |
| `renderLines` | Compose preindexed presentation lines/header | Raw mode still renders the complete source |
| `Timeline` | Seekable progress, section markers, settings, and shortcut help | Fixed to viewport bottom |
| `Inspector` | Variables, stack, stdout, and stderr tabs | Large values are still formatted synchronously |
| `Rendering` | Dispatch core and structured types | Public extension contract remains undefined |
| `MarkdownRenderer` | Convert/sanitize Markdown and request node-scoped math | Bundled MathJax is lazy-loaded |
| `ExternalLink` | Render validated citation links and hover details | HTTP(S) only; isolated new tabs |
| `renderAuthors` | Compact long author lists | Presentation-only utility embedded in core file |
| `scrollSectionIntoView` | Pin new section headings to the window top; do not chase in-section blocks | Uses `window.scrollTo`, not `scrollIntoView` |

## Inferred trace model

The checked-in schema is `schema/trace.schema.json`. Its core shape is:

```ts
type Trace = {
  files: Record<string, string>;
  steps: Step[];
};

type Step = {
  stack: StackFrame[];
  env: Record<string, JsonValue>; // appears to be a delta
  renderings: Rendering[];
  stdout: string;
  stderr: string;
};

type StackFrame = {
  path: string;
  line_number: number;
  function_name: string;
  code: string;
  invocation_id?: number | string;
};

type Rendering = {
  type: "markdown" | "image" | "link" | string;
  data: unknown;
  style: Record<string, unknown>;
  internal_link?: { path: string; line_number: number };
  external_link?: {
    title?: string;
    authors?: string[];
    organization?: string;
    date?: string;
    url: string;
    description?: string;
    notes?: string;
  };
};
```

`env` is a delta scoped by `invocation_id`. Repeated renderings replace the prior
value for their location starting at the step that carries the new rendering.

## Data characteristics

A 12,890-step fixture used while designing format version 2 (not
shipped in this repository):

| Property | Value |
| --- | ---: |
| Steps | 12,890 |
| Embedded files | 1 |
| Source lines | 1,156 |
| Maximum stack depth | 32 |
| Average stack depth | 9.91 |
| Stack frame records | 127,681 |
| Unique frame locations | 652 |
| Steps with environment updates | 265 |
| Steps with renderings | 169 |

The trace repeats stack paths, names, source snippets, and frame sequences. A
normalized representation can preserve an open JSON contract while referencing
interned file, frame, string, and rendering tables.

## Current dependency roles

| Dependency | Role | Assessment |
| --- | --- | --- |
| React / React DOM | UI and state | Appropriate |
| React Router | Query navigation | More routing than the current single-view app needs |
| highlight.js core | Syntax highlighting | Only Python, Dart, Bash, diff, and plaintext are registered |
| marked | Markdown to HTML | Output is sanitized before insertion |
| DOMPurify | Untrusted rich-content boundary | Appropriate and required by product trust model |
| Bundled MathJax | Base TeX math rendering | Lazy CHTML runtime and on-demand local WOFF fonts; no AMS/optional packages |

## Performance dependency graph

```text
step URL changes
    |
    +-> active step derivation
    +-> materialize at most one bounded environment checkpoint chain
    +-> render preindexed presentation lines (or all lines in raw mode)
```

Reveal/rendering/line indexes and highlighting now use a one-time compile stage.
The remaining scale target is a Web Worker compile stage and virtualization for
very large raw source files.
