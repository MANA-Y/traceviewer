# Presentation genres

TraceViewer already covers one genre well: a technical talk that grows out of a
Python program. New kinds of presentations should come from new *scenarios*, not
from a larger widget catalog.

The product constraint is stable. Slide order is execution order. Extra
execution stays in the raw trace and is omitted from `presentationSteps`.
Audience playback follows that sparse track; source mode can still walk every
event. Notes, the inspector, and live control stay presenter-only.

This note records which genres fit that model today, which ones are worth
adding, and which renderers would unlock them. It does not change the snapshot
or live contracts.

## What exists today

The authoring helpers already cover markdown, highlighted code, images with
focus and overlays, links, tables, line and bar charts, metric cards, callouts,
diffs, quotes, sections, columns, dividers, notes, and captured command output.

The included examples sit in a narrow band of that surface:

| Example | Genre |
| --- | --- |
| `presentations/example.py` | Bug review (checkout timeouts) |
| `traceviewer new --template starter` | Short first talk |
| `traceviewer new --template bug-review` | Symptom, hypothesis, diff, fix |
| `traceviewer new --template workshop` | Prompt, recorded result, your-turn pause |
| `traceviewer new --template compare` | Two measurements, one verdict |

A rendering-free debugger recording is also legal. When a trace has no
non-note renderings, readers treat every step as a presentation step.

## Genres the current API already supports

These do not need a format change. They need named starter templates and a
documented pattern.

### Bug review / postmortem

The raw trace can keep the full investigation. The presentation track keeps
only turning points: symptom, hypothesis, counterexample, fix. Loops and
helpers stay in source view.

Use `section` for each beat, `callout` with `danger` or `warning` for the
failure, `diff` for the change, and `notes` for what to say aloud.

### Workshop / lab

Each presentation step is a prompt. The next step shows a recorded
`terminal` or `shell` result. The live presenter walks the room on the same
track the audience sees.

A dedicated “your turn” callout is enough to mark a pause. Do not introduce a
networked notebook for this genre. A live pointer is how the presenter points
at a student’s screen-equivalent without adding overlays to the exercise.

### Comparison talk

`columns`, `table`, `chart`, `metrics`, and `diff` already stage A-versus-B
arguments. The pattern is two measured runs, one comparison block, then a
single verdict callout. The Flutter and Triton talks are this genre with more
narration around the numbers.

### Profile tour

`image` with `focus` and `overlays` is built for a profiler screenshot. One
image per section, one step per region. This is a different talk shape with
no new renderer. Authored overlays mark planned regions; a live pointer
covers the unplanned “look here” during questions.

### Execution recording

A trace without audience renderings is already a debugger recording. Treat
that as an explicit mode in authoring docs: inspector and stack are the
stage, markdown is optional.

## Genres worth adding

These stay inside the same execution-as-slides model. Each one needs a small
amount of player or CLI work, not a second product.

### Repository walkthrough

Lead a review through real files instead of rewriting them as slides. Internal
`link` already points at a Python symbol. The missing pieces are “open this
file or function as the current slide” and a multi-file outline. The genre is
a live code review.

### Derived argument

Lazy MathJax already supports a talk that adds one line of a proof, protocol,
or state machine per step. This is mostly a scaffold pattern:
`traceviewer new derivation`.

### Branched deep dive

The same recording can have more than one playback track: the default talk, a
deeper appendix, and a questions path. `presentationSteps` is currently a
single list. Named tracks (`default`, `deep-dive`, `questions`) are the
strongest lever for new genres, because they reuse one execution without
forcing the audience through every detour.

### Rehearsal view

The rehearsal timer already exists. A rehearsal genre would show notes and
section timing in the foreground and keep the stage minimal. Same file,
different chrome.

### Conference package

`traceviewer pack` already builds a portable folder. Presets would turn that
into named kits: `talk` for the audience artifact, `handout` without notes,
and `workshop-kit` with exercises. The genre is a conference talk that does
not need Python at show time.

### Live pointer

A movable pointer is presenter chrome, not a rendering. It belongs with
workshops, profile tours, and conference talks: the speaker needs to point at
something that was not authored as an overlay.

Three pointing tools already exist or are adjacent. They must stay distinct.

| Tool | What moves | Where it lives | Who sees it |
| --- | --- | --- | --- |
| Current-line highlight | Keyboard / timeline step | Playback and the URL | Everyone; this *is* navigation |
| Image `focus` and `overlays` | Nothing at show time | The snapshot, authored in Python | Everyone, including offline replay |
| Live pointer | Presenter mouse or trackpad | Ephemeral live state, like `set_step` | Live audience only |

The current-line highlight is the keyboard cursor. It already tells the room
which authored line is active. Do not replace it with a free-floating caret
inside the source.

Image overlays stay for places the author marked in advance: a spike on a
profiler PNG, a box around one metric. They are complete rendering state and
replay without a live connection.

The live pointer is for what appears during the talk. Coordinates are
percentages of the stage, not CSS pixels, so audience windows of different
sizes stay aligned. A visible/hidden flag is enough; the pointer is off until
the presenter turns it on. Reconnecting clients receive the last pointer
state the same way they receive the last `stepIndex`.

Do not write pointer coordinates into the snapshot. Offline replay and
`traceviewer pack` have no laser. Recording a path would turn the format into
a screencast and break the rule that a rendering list is the complete state
of a location at a step.

Throttle live updates. Step changes stay reliable; pointer motion can drop
intermediate events. Hide the pointer when the presenter leaves the stage or
changes revision, so a stale dot does not sit on the next talk.

## Renderers that unlock a genre

Add a block only when it makes a new scenario possible.

| Helper | Genre it unlocks |
| --- | --- |
| `compare` — two code columns and a verdict | Architecture and RFC reviews |
| `sequence` or a static timeline | Protocols, retries, races |
| `quiz` / `prompt` with precomputed answers | Workshops and lectures |
| Short local or URL `audio` / `video` | Keynote inserts, not the lecture body |
| Pre-serialized SVG `canvas` or graph | Systems, memory, pipelines |
| A chart that replaces its series on later steps | Latency or loss unfolding over time |

Live HTML, arbitrary JavaScript, and open-ended widgets are out of scope.
They break offline replay and the rule that a rendering list is the complete
state of a location at a step.

## Suggested order

1. Starter templates on the current API:
   `traceviewer new --template bug-review`, `workshop`, and `compare`.
   A profile-tour starter can follow once a bundled screenshot is worth
   shipping.
2. Add a live pointer next to `presentation_state`. It unlocks workshop and
   profile-tour pointing without a new renderer or snapshot field.
3. Add named playback tracks so one recording can serve a default talk and a
   deep dive.
4. Add at most one or two renderers after those templates exist. Prefer
   `compare` and `sequence`.

Package presets can follow once `pack` is the usual conference path.

## Non-goals

- A PowerPoint-style deck with absolutely positioned slides.
- A Jupyter-compatible execution notebook.
- Arbitrary HTML or JavaScript inside a trace.
- Growing the renderer list without a genre that needs the new block.
- Recording a pointer path into the snapshot or treating the laser as a
  rendering type.

Those are other products. TraceViewer stays useful when slide order is
execution order and `presentationSteps` hides the rest.
