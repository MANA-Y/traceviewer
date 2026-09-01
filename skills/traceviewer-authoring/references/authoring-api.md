# Authoring API

Import helpers from `traceviewer`. Repository modules may still use `execute_util` or `traceviewer_producer`.

## Basic content

| Helper | Purpose | Important arguments |
| --- | --- | --- |
| `text(message, style=None, verbatim=False)` | Markdown text | `verbatim=True` preserves whitespace |
| `code(source, language, style=None)` | Highlighted code | Use language names such as `dart`, `bash`, `python`, `json` |
| `image(url, style=None, width=None, alt=None, focus=None, overlays=None)` | Local or cached remote image | `focus` and overlay coordinates use percentages of the image |

To explain several regions of one PNG, use a focus rectangle and overlay markers:

```python
image(
    "public/var/profile.png",
    width=1000,
    alt="Performance profile with three charts",
    focus={"x": 48, "y": 8, "width": 45, "height": 38},
    overlays=[{
        "x": 72,
        "y": 24,
        "title": "Latency spike",
        "text": "The queue grows immediately after this peak.",
        "focus": {"x": 62, "y": 12, "width": 22, "height": 24},
    }],
)
```

`x` and `y` are measured from the top-left corner. Hovering or focusing a numbered marker opens its hint; clicking a marker with its own `focus` zooms further into that region.
| `link(target, style=None)` | External URL or internal Python symbol | URL metadata may be resolved during capture |

## Data and explanation

| Helper | Purpose | Constraints |
| --- | --- | --- |
| `table(headers, rows, caption=None)` | Comparison or exact values | Every row must match the header count |
| `chart(labels, series, kind="line")` | Local SVG line/bar chart | `kind` is `line` or `bar`; every series matches label count |
| `timeline(lanes, title=None, unit="ms", compress="wait", series=None, colors=None)` | SVG Gantt / averaged timeline | Lanes use `name`+`start`+`duration`, or `spans` for UIC/FW overlay; `kind="wait"` is compressed |
| `graph(nodes, edges, title=None, lanes=None)` | SVG stage graph with connections and cycles | Nodes: `id`+`label`+optional `kind`/`lane`/`column`; edges: `(from, to)` or `{from, to, kind="cycle"}` |
| `metrics(items)` | Compact metric cards | Pass a non-empty mapping |
| `callout(message, tone="info", title=None)` | Emphasized conclusion or warning | Tone: `info`, `success`, `warning`, `danger` |
| `diff(before, after, language="text")` | Unified before/after change | Keep samples focused enough to compare on screen |
| `quote(message, attribution=None)` | Quotation or memorable rule | Attribution is optional |

## Composition

| Helper | Purpose | Constraints |
| --- | --- | --- |
| `section(title, subtitle=None)` | Visual section boundary | Title is required |
| `columns(*cells, gap="normal")` | Responsive Markdown columns | 2–4 cells; gap: `compact`, `normal`, `wide` |
| `divider(label=None)` | Separate adjacent ideas | Label is optional |
| `notes(message)` | Presenter-only guidance for the preceding content step | Non-empty string; hidden from the audience view; does not add a playback step |

Column cells are Markdown strings. Use dedicated helpers outside `columns()` for charts, code, tables, and other structured content.

## Commands

| Helper | Behavior | Use for |
| --- | --- | --- |
| `code(command, "bash")` | Does not execute | Commands the audience should copy or discuss |
| `shell(command)` | Executes without a system shell; renders stdout as text | Small successful read-only demonstrations |
| `terminal(command)` | Executes without a system shell; captures command, stdout, stderr, exit code, duration | CLI demonstrations and expected failures |

Both execution helpers accept a string parsed with `shlex` or an argument list. They do not run through `shell=True`, so pipes, redirects, variable expansion, and shell built-ins are not interpreted. Use a dedicated script when a demonstration requires a pipeline.

`system_text()` is a legacy alias for `shell()`; do not use it in new presentations.

## Captured variables

Add `# @inspect variable_name` to a source line when the presentation needs that local value in the environment panel. Use `--inspect-all-variables` only for diagnosis because it adds noise and trace size.

Values must be serializable by the producer contract. Keep inspected data small and presentation-safe.
