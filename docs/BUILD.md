# Building TraceViewer on another host

This is the rebuildable source tree. Authors installing a `traceviewer` wheel
do not need this file: the viewer is already inside the package.

This tree does not contain `node_modules`, a Python virtualenv, a production
`dist/` viewer, or a prebuilt `traceviewer` binary. Those are created on the
machine that will rebuild the tool.

The binary is platform-local. Build it on every operating system and
architecture you need; a macOS executable will not run on Linux or Windows.

## Requirements

- Python 3.11 or newer
- Node.js 18 or newer, with `npm`
- A network connection for the first `pip` and `npm ci` installs

Optional, only for the standalone CLI:

- the `binary` extra, which installs PyInstaller

On Windows, `py -3` can replace `python` if the Python launcher is installed.

## Unpack

If you received `traceviewer-source.zip`:

```bash
unzip traceviewer-source.zip
cd traceviewer
```

The archive root folder is `traceviewer/`. It includes `README.md`, this file,
and [Authoring presentations](AUTHORING.md).

To create that zip from an existing checkout:

```bash
python3 scripts/pack_source.py
```

The output is `dist/traceviewer-source.zip`. Copy only that file to the other
host. Do not copy `node_modules/`, `.venv/`, `dist/traceviewer`, or `build/`.

## Bootstrap (recommended)

macOS and Linux:

```bash
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

Windows (Command Prompt):

```bat
scripts\bootstrap.cmd
```

The script creates `.venv/`, installs the producer with live reload and
PyInstaller, runs `npm ci`, builds the viewer into `dist/`, and runs
`traceviewer doctor`.

## Manual install

From the unpacked repository root:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -e 'producer[live,binary]'
npm ci
npm run build
.venv/bin/traceviewer doctor
```

Windows:

```bat
python -m venv .venv
.venv\Scripts\python -m pip install -U pip
.venv\Scripts\python -m pip install -e "producer[live,binary]"
npm ci
npm run build
.venv\Scripts\traceviewer doctor
```

`doctor` should report Python 3.11+, the live transport, and a viewer path
under `dist/`. `npm` is only required when you rebuild the web UI.

On later updates, run `npm ci` and `npm run build` again after pulling or
unpacking a newer source archive.

## Standalone CLI

After the viewer build exists:

```bash
.venv/bin/python scripts/build_binary.py
```

Windows:

```bat
.venv\Scripts\python scripts\build_binary.py
```

The result is `dist/traceviewer` or `dist/traceviewer.exe`. It embeds the
production viewer runtime (HTML, JS, CSS, and MathJax fonts). It does not
embed example presentations.

Smoke-check it:

```bash
./dist/traceviewer --help
./dist/traceviewer doctor
./dist/traceviewer serve
```

Rebuild on each target OS and CPU architecture. The build script does not
upload or publish the binary.

## What to run after a successful build

Author and rehearse:

```bash
.venv/bin/traceviewer dev presentations.example
```

Create a new talk:

```bash
.venv/bin/traceviewer new hello
.venv/bin/traceviewer dev presentations.hello
```

The complete authoring workflow is in [AUTHORING.md](AUTHORING.md).

## Remote access

Loopback is the default. On a LAN, opt in explicitly:

```bash
traceviewer serve --host 0.0.0.0 --port 4173
traceviewer live presentations.hello \
  --host 0.0.0.0 \
  --allow-remote \
  --viewer-url http://192.168.1.20:4173 \
  --public-url http://192.168.1.20:8765 \
  --origin http://192.168.1.20:4173
```

For an internet tunnel, keep both services on loopback and pass the public
addresses. An `https://` socket URL becomes `wss://`. TraceViewer does not
terminate TLS itself.

See [LIVE_PROTOCOL.md](LIVE_PROTOCOL.md) for roles and tokens.

## Contributor checks

```bash
npm run test:all
npm run lint
npm run build
npm run test:browser
npm run test:production
npm run benchmark:large
```

Browser tests need Playwright browsers (`npx playwright install`). They are
not required to author or present.

`benchmark:large` generates a 100,000-step fixture in memory and fails if
compiled playback exceeds a provisional 200 MB heap budget.

Pushes to `main` deploy the production viewer and bundled example to
[GitHub Pages](https://mana-y.github.io/traceviewer/).

## Release wheel

Tag a version that matches `producer/pyproject.toml` and push the tag. The
[Release wheel](../.github/workflows/release.yml) workflow builds the viewer,
copies it into the package, packs `traceviewer-*-py3-none-any.whl`, smokes
`new` / `validate` / `pack` in a clean venv, and attaches the wheel to the
GitHub Release.

```bash
git tag v0.2.0
git push origin v0.2.0
```

Authors then install without Node:

```bash
python -m pip install 'traceviewer[live] @ https://github.com/MANA-Y/traceviewer/releases/latest/download/traceviewer-py3-none-any.whl'
```

Do not publish that name to PyPI until the public brand is settled. GitHub
Releases are enough for the first speakers.

## Common failures

| Symptom | Fix |
| --- | --- |
| `Python 3.11 or newer is required` | Install a newer Python and recreate `.venv` |
| `npm: command not found` | Install Node.js 18+ and ensure `npm` is on `PATH` |
| `TraceViewer web build not found` | Run `npm run build` in the repository root |
| `Live transport missing` | Reinstall with `pip install -e 'producer[live]'` or `pip install 'traceviewer[live]'` |
| PyInstaller missing | Reinstall with `pip install -e 'producer[live,binary]'` |
| Binary built on the wrong OS | Repeat `scripts/build_binary.py` on the machine that will run it |
| Viewer opens but examples 404 | The example snapshot lives at `public/var/traces/presentations.example.json`; run `traceviewer build presentations.example` and `npm run build` so Vite copies `public/` |

Do not commit or copy `.venv/`, `node_modules/`, or `build/`. Those are local
install outputs, not source.
