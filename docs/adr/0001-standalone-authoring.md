# ADR 0001: Standalone authoring contract

Status: accepted  
Date: 2026-09-01

## Context

TraceViewer is a code-first slide tool: a Python `main()` becomes a talk, and
slide order is execution order. The working loop was bound to this repository
(`presentations/`, `execute_util`, `public/`, `npm run build`). That is a
contributor checkout, not a utility a speaker can install and use.

Playback-engine work in `docs/ROADMAP.md` does not unblock that path. This
record locks the product contract so packaging and CLI changes stay aligned.

## Decision

1. **A talk is an ordinary directory**, not a module inside this git tree.
   `traceviewer new my-talk` creates `my-talk/talk.py` and `my-talk/assets/`.
   `dev`, `build`, `pack`, and `validate` accept a file path (`talk.py`) or a
   dotted module (`presentations.example`).

2. **Authors need Python 3.11+ only.** Node.js is for people changing the
   React viewer. The production viewer ships as package data inside the
   installed wheel (copied from `dist/` at package build time).

3. **The canonical import is `from traceviewer import ...`.**
   `execute_util` and `traceviewer_producer` stay as compatibility imports for
   this repository and existing modules.

4. **The distribution, CLI, and import name stay `traceviewer`.** The public
   tagline remains "Code-first slides for technical talks." A consumer-facing
   rename is deferred until a name is chosen; do not publish PyPI under a
   name that will be thrown away. The on-disk snapshot format may still be
   called a trace.

5. **This repository is the player, producer, and bundled examples.** Local
   talks under `presentations/` remain gitignored except `example.py`.

6. **Engine milestones in `docs/ROADMAP.md` are deferred** until a stranger
   can `new` → `dev` → `pack` on a machine that never cloned this tree.

## Consequences

- Default `new` no longer writes `presentations/<name>.py`.
- Build and pack write next to the talk when `public/` is absent; this repo
  still uses `public/var/traces` when that tree exists.
- Live `dev` serves the talk directory (and `public/` when present) so
  `assets/` images resolve without Vite.
- `traceviewer-producer` is no longer the project name. Install extras are
  `traceviewer[live]` (path form remains `producer[live]`).
