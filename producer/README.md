# TraceViewer producer

Runs a Python presentation module, records source locations and selected
values, and writes a versioned JSON snapshot for the viewer.

User-facing workflow: [docs/AUTHORING.md](../AUTHORING.md).
Helper signatures: [authoring API](../skills/traceviewer-authoring/references/authoring-api.md).
Product contract: [ADR 0001](../docs/adr/0001-standalone-authoring.md).

## Install

From this repository, after `npm run build` (or `./scripts/bootstrap.sh`):

```bash
python -m pip install -e '.[live]'
```

The path form `pip install -e 'producer[live]'` from the repo root is the
same package. A release wheel is named `traceviewer` and includes the viewer
build; authors then do not need Node.js.

Add the `binary` extra only when building the standalone CLI.

## Commands

```bash
traceviewer new hello
cd hello
traceviewer dev talk.py
traceviewer build talk.py
traceviewer validate talk.py
traceviewer doctor
traceviewer pack talk.py --output dist/hello-presentation
traceviewer serve --port 4173
```

`dev` starts the built viewer and live producer together. Use `live` instead
when you are changing the React viewer with `npm run dev`. Both accept a file
path or a dotted module (`presentations.example`).

New talks import helpers from `traceviewer`. In this repository,
`execute_util` remains a compatibility shim.

```python
from traceviewer import callout, code, notes, text


def main():
    text("# Example")
    notes("Presenter-only guidance.")
    code("print(42)", "python")
    callout("Save the file to refresh the live view.", tone="success")
```

`notes()` attaches to the previous content step. Static audience builds strip
notes and, when notes exist, the Python source as well. Use
`--include-notes` only for a private presenter snapshot.

The legacy entrypoints still work:

```bash
python execute.py -m presentations.hello
traceviewer -m presentations.hello --live
```

Live mode prints independent presenter, notes, and audience URLs. Only the
presenter token can send step controls or receive notes. Non-loopback binding
requires `--allow-remote`. See [docs/LIVE_PROTOCOL.md](../docs/LIVE_PROTOCOL.md).

Copy rebuildable source with `python3 scripts/pack_source.py` and follow
[docs/BUILD.md](../docs/BUILD.md). Build a local binary with
`python scripts/build_binary.py` after installing `producer[binary]`. The
script does not publish its output.

Optional libraries such as Torch or SymPy belong to presentation modules, not
to this package. Common values are serialized only if the presentation already
loaded those libraries.
