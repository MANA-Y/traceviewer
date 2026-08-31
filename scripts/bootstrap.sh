#!/usr/bin/env bash
# Install TraceViewer on this machine from a source checkout or unpacked archive.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11 or newer is required." >&2
  exit 1
fi
python3 - <<'PY'
import sys
if sys.version_info < (3, 11):
    raise SystemExit(f"Python 3.11 or newer is required, found {sys.version.split()[0]}")
PY

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required (Node.js 18 or newer)." >&2
  exit 1
fi

python3 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install -e 'producer[live,binary]'
npm ci
npm run build
.venv/bin/traceviewer doctor

cat <<'EOF'

TraceViewer is ready on this machine.

Author a presentation:
  .venv/bin/traceviewer dev presentations.example

Build a standalone CLI for this OS and architecture:
  .venv/bin/python scripts/build_binary.py

Documentation:
  docs/BUILD.md
  docs/AUTHORING.md
EOF
