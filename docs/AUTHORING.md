# Authoring presentations

A TraceViewer presentation is a Python module. The producer runs `main()`,
records each helper call as a playback step, and shows those steps in the
browser. You do not maintain a separate slide deck.

This guide assumes the toolchain is installed. A release wheel includes the
viewer. If you unpacked this source tree, start with [BUILD.md](BUILD.md).

The helper reference is
[skills/traceviewer-authoring/references/authoring-api.md](../skills/traceviewer-authoring/references/authoring-api.md).
The product contract is [ADR 0001](adr/0001-standalone-authoring.md).
The bundled example is [presentations/example.py](../presentations/example.py),
a short checkout-timeout review. New talks start from `traceviewer new`.

## 1. Create a talk

```bash
traceviewer new hello
cd hello
traceviewer dev talk.py
```

This writes `hello/talk.py` and `hello/assets/`. It refuses to overwrite an
existing talk. Use `--force` only when replacement is intentional. `--directory`
sets the parent folder. `--template` picks a talk shape:

| Template | Shape |
| --- | --- |
| `starter` | Short first talk (default) |
| `bug-review` | Symptom, hypothesis, diff, fix |
| `workshop` | Prompt, recorded output, your-turn pause |
| `compare` | Two measurements, one verdict |

New talks import helpers from the installed package:

```python
from traceviewer import callout, code, notes, section, text
```

In this repository, `execute_util` and `traceviewer_producer` still work.
Keep long samples in constants above `main()`. Only helper calls inside the
flow become audience rows, so line numbers stay presentation-relative.

```python
from traceviewer import callout, code, notes, section, text


SAMPLE = """def main():
    print("Hello")
"""


def main():
    text("# My first presentation")
    notes("Introduce the problem this presentation will solve.")
    text("Each helper call becomes a playback step.")
    section("Code", "Show only what supports the story")
    code(SAMPLE, "python")
    callout("Save the file to update the live presentation.", tone="success")
```

Do not add fake navigation chrome, slide numbers, or a second `main()` that
exists only to look like a slide. The viewer derives those.

## 2. Edit with live reload

```bash
traceviewer dev talk.py
```

From this repository you can also pass a dotted module:

```bash
traceviewer dev presentations.example
```

This serves the production viewer, starts the live producer, and opens the
presenter URL. Use `--no-open` to print URLs without launching a browser.

Save the Python file. The producer rebuilds the trace and updates the open
page. You do not refresh. A broken edit appears as a diagnostic on the
presenter connection; the last valid presentation stays playable.

Live mode prints three URLs:

- **Presenter URL** — slide deck, privileged token, step control; share this screen
- **Notes URL** — optional phone/second window: speaker notes and the same control
- **Audience URL** — follow-only, no notes, no private authoring source

Share the presenter window. Open notes with `N` or the Notes URL on a phone.
Changing `role=audience` to `role=presenter` does not grant presenter access.
Never commit or send a live session token.

Viewer contributors who are changing the React app can run `npm run dev` and
`traceviewer live presentations.hello --open` in two terminals instead of
`traceviewer dev`.

## 3. Choose a helper per reveal

One helper call is one beat. Prefer a structured block over a Markdown
approximation when the block matches the content.

### Text and media

```python
text("## Why this matters")
code("python -m pip install -e producer", "bash")
image("public/var/profile.png", width=900, alt="Latency profile")
link("https://example.com/docs")
```

Put images in `assets/` next to `talk.py`, or under `public/` in this
repository, so snapshots and packed folders stay portable. For one PNG that
contains several charts, `focus` selects the visible region and `overlays`
add numbered explanations. Coordinates are percentages of the image.

### Data and explanations

```python
table(
    ["Build", "Median", "p95"],
    [["JIT", "42 ms", "58 ms"], ["AOT", "11 ms", "14 ms"]],
    caption="CLI latency",
)
chart(["JIT", "AOT"], {"median": [42, 11], "p95": [58, 14]}, kind="bar")
timeline(
    [
        {"name": "parse", "start": 0, "duration": 6.0},
        {"name": "wait", "start": 8, "duration": 120, "kind": "wait"},
        {"name": "draw", "start": 128, "duration": 12.0},
    ],
    title="Average request timeline",
)
graph(
    [
        {"id": "net", "label": "network", "kind": "wait"},
        {"id": "draw", "label": "draw", "kind": "ui"},
    ],
    [("net", "draw"), {"from": "draw", "to": "net", "kind": "cycle", "label": "retry"}],
    title="Request and render loop",
)
metrics({"AOT median": "11 ms", "samples": 30})
callout("Measure on a physical device.", tone="warning")
diff("await load();", "await traced('load', load);", "python")
```

### Layout

```python
section("Two surfaces", "Use a different experiment for each")
columns(
    "### CLI\nStartup, throughput, and CPU samples.",
    "### UI\nFrame latency and jank.",
)
quote("If you cannot reproduce it, you cannot optimize it.", "Review rule")
divider("Instrumentation")
```

Column cells are Markdown. Keep charts, tables, and highlighted code as their
own steps.

### Commands

```python
code("python -m pip show traceviewer", "bash")  # shown, not executed
shell(["python", "--version"])                  # stdout from a successful command
terminal(["python", "-m", "compileall", "."])   # command, streams, exit, duration
```

`shell()` and `terminal()` take an argument list or a string parsed by `shlex`.
They do not use a system shell, so pipes, redirects, and `cd` are not
interpreted. Do not run mutating commands unless that mutation is the point of
the demonstration.

### Speaker notes

Place `notes("...")` immediately after the step it explains. Notes are not a
playback step. They appear in presenter mode (`P`) and in PDF export as
book-style commentary. Audience exports strip notes, and if notes exist the
Python source is also withheld from the audience artifact so the note text
cannot leak. Use `build --include-notes` only for a private presenter file.

### Inspected values

Add `# @inspect name` on a source line when that local value should appear in
the presenter inspector. Keep inspected data small. `--inspect-all-variables`
is a diagnostic switch, not a default.

## 4. Rehearse

| Key | Action |
| --- | --- |
| `→` or `L` | Next presentation step |
| `←` or `H` | Previous presentation step |
| `J` or `Shift` + `→` | Step over forward |
| `K` or `Shift` + `←` | Step over backward |
| `U` | Step out |
| `A` | Toggle progressive reveal |
| `R` | Toggle audience / source view |
| `P` | Toggle on-slide presenter overlay |
| `N` | Open the notes and control window |
| `G` | Open another snapshot |
| `?` | Shortcut help |

The current step lives in the URL, so a refresh keeps the position.

Check step 0, a middle step, and the last step. Confirm notes, columns on a
narrow window, and that every visible row earns its place.

Validate without opening the browser:

```bash
traceviewer validate talk.py
traceviewer doctor
```

## 5. Publish

```bash
traceviewer build talk.py
traceviewer pack talk.py --output dist/hello-presentation
traceviewer serve --dist-path dist/hello-presentation
```

Outside this repository, `build` writes `talk.json` in the current directory.
Inside this repository it writes `public/var/traces/<module>.json`. Open a
repo snapshot with `?trace=/var/traces/presentations.example.json&animate=1`.

`pack` copies the viewer runtime, the snapshot, and the images that snapshot
references. It refuses missing assets, path traversal, invalid traces, and an
existing destination unless you pass `--force`. Live `dev` also serves the
talk directory so `assets/` images work without packing.

To host the viewer as ordinary static files from a checkout, run `npm run build`
and serve `dist/`. Keep those assets under `public/` so Vite copies them.

LAN and tunnel flags are in [BUILD.md](BUILD.md#remote-access).

## 6. Included examples

- [presentations/example.py](../presentations/example.py) — checkout-timeout bug review

Other files under `presentations/` are local talks and are gitignored.
Generate the bundled snapshot with notes (so presenter overlay and source
view stay complete) with:

```bash
traceviewer build presentations.example --include-notes
```

## Writing rules

- Write the talk in the language the audience should see.
- One claim or question per section.
- Short prose, focused code, few series on a chart.
- Local assets only; no presenter-machine absolute paths.
- No secrets or live tokens in source or committed URLs.
- The Python module is the source of truth. Regenerated JSON is an output.
