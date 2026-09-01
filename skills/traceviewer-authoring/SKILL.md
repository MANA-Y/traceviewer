---
name: traceviewer-authoring
description: Create, edit, rehearse, and validate code-first TraceViewer presentations written as Python modules. Use when an agent must start a new presentation, convert an outline into progressive reveals, select TraceViewer blocks, run the producer with hot reload, diagnose an authored deck, or generate a portable static trace.
---

# TraceViewer authoring

Create presentations as executable Python modules. Treat every visible helper call as one deliberate reveal and keep the audience view clean.

## Locate the project

Prefer the user's current talk directory. A standalone talk is `talk.py` plus optional `assets/`. Do not require the TraceViewer repository checkout.

If the workspace *is* the TraceViewer repository, confirm that `producer/`, `package.json`, and `presentations/example.py` exist before editing. Preserve unrelated workspace changes. `execute_util` remains valid only for in-repo modules.

Read [references/authoring-api.md](references/authoring-api.md) when selecting blocks or checking their signatures. The human-facing workflow is [docs/AUTHORING.md](../../docs/AUTHORING.md). Inspect `presentations/example.py` only when editing that bundled starter.

## Start from scratch

1. Turn the requested story into short sections. Give each section one claim or question.
2. If no talk exists, run `traceviewer new <name>` to create `<name>/talk.py`. Use `--template bug-review`, `workshop`, or `compare` when the story matches that shape. Do not replace an existing talk unless the user explicitly requests `--force`.
3. Import helpers from `traceviewer`. Use `execute_util` only when editing a module that already imports it.
4. Put long code samples in named module constants above `main()`.
5. Add one helper call per reveal. Keep calls in narrative order.
6. Add `notes("...")` immediately after the content step when the presenter needs a private prompt. Notes do not create an audience step.
7. Prefer structured blocks over Markdown approximations: use `table`, `chart`, `columns`, `metrics`, `callout`, `diff`, and `section` when they express the content directly.
8. Keep shell execution explicit. Use `code(command, "bash")` for illustrative commands, `shell(command)` for plain captured output, and `terminal(command)` when command, streams, exit code, and duration matter.

Use this minimal shape:

```python
from traceviewer import callout, code, notes, section, text


EXAMPLE = """void main() {
  print('Hello');
}"""


def main():
    text("# Presentation title")
    text("One-sentence promise to the audience.")
    section("First idea", "Why it matters")
    code(EXAMPLE, "dart")
    callout("The conclusion the audience should retain.", tone="success")
    notes("Pause and let the conclusion land before moving on.")
```

Do not add fake `def main():` slides, manual line numbers, navigation controls, or presentation chrome. The viewer derives these.

## Iterate with hot reload

From the talk directory:

```bash
traceviewer dev talk.py
```

Viewer contributors working in the TraceViewer repository can run `npm run dev` and `traceviewer live presentations.<name> --open` in two terminals instead.

Keep the process running while editing; saving the presentation module triggers a revision. If an edit fails, inspect the producer diagnostic and fix the module—the viewer keeps the last valid revision.

When browser automation cannot access localhost, verify the producer and dev server with their terminal output or `curl`; do not claim visual verification without inspecting the rendered page or a user screenshot.

## Review the result

Check the presentation at step 0, a middle step, and the final step.

- Confirm right/left navigation and the `H`, `L`, `J`, `K`, and `U` shortcuts.
- Press `A` and verify progressive reveal: future rows are faint, current is highlighted, past rows remain readable.
- Press `R` and verify both audience and source views.
- Press `P` and verify speaker notes, current section, and next-step context.
- Press `?` and ensure help matches active shortcuts.
- Check that line numbers are presentation-relative in audience view and source-relative in raw view.
- Check narrow layout when using columns, wide tables, long code, or charts.
- Remove content that is visible but does not advance the story.

Keep content readable at presentation distance: short prose, focused code, few series per chart, and no dense wall of helpers on one step.

## Produce the static artifact

After rehearsal succeeds, generate the portable snapshot:

```bash
traceviewer build talk.py
```

Expect `talk.json` next to the talk, or `public/var/traces/<module>.json` when working inside the TraceViewer repository.

If the workspace is this repository and you changed the viewer, run proportionate validation:

```bash
npm run test:all
npm run lint
npm run build
```

Report the authored module, generated snapshot, validation results, and any visual checks that remain for the user.

## Editing rules

- Write presentation code, documentation, and comments in English unless the requested presentation language differs.
- Never embed secrets or live tokens in presentation sources or committed URLs.
- Never use `shell()` or `terminal()` for commands that mutate external systems without explicit user authorization.
- Preserve failed-command output with `terminal()` when failure is part of the demonstration; `shell()` raises on a non-zero exit.
- Use local assets under `assets/` next to `talk.py`, or `public/` in this repository. Do not depend on a presenter machine's absolute paths.
- Regenerate the snapshot after source changes; the static trace is an output, not the authoring source.
