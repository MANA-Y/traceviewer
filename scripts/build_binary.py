#!/usr/bin/env python3
"""Build a local TraceViewer executable containing the production web UI."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VIEWER_STAGE = ROOT / "build" / "viewer-bundle"
RUNTIME_TOP_LEVEL = {"index.html", "assets", "mathjax-fonts"}
SKIP_NAMES = {"traceviewer", "traceviewer.exe", "traceviewer-package", ".DS_Store"}
SKIP_SUFFIXES = {".so", ".dylib", ".dll", ".o", ".a", ".exe"}


def run(*command: str) -> None:
    subprocess.run(command, cwd=ROOT, check=True)


def stage_viewer(source: Path, destination: Path) -> Path:
    """Copy the Vite build into a clean tree that PyInstaller can embed."""
    if not (source / "index.html").is_file():
        raise FileNotFoundError(f"viewer build is missing index.html: {source}")
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)

    for path in source.rglob("*"):
        if not path.is_file():
            continue
        if path.name in SKIP_NAMES or path.suffix.lower() in SKIP_SUFFIXES:
            continue
        relative = path.relative_to(source)
        if relative.parts[0] not in RUNTIME_TOP_LEVEL:
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    if not (destination / "index.html").is_file():
        raise FileNotFoundError(f"staged viewer is incomplete: {destination}")
    return destination


def main() -> int:
    run("npm", "run", "build")
    stage_viewer(ROOT / "dist", VIEWER_STAGE)
    run(
        sys.executable,
        "-m",
        "PyInstaller",
        "--clean",
        "--noconfirm",
        str(ROOT / "traceviewer.spec"),
    )
    suffix = ".exe" if sys.platform == "win32" else ""
    binary = ROOT / "dist" / ("traceviewer" + suffix)
    if not binary.is_file():
        raise SystemExit(f"PyInstaller did not write {binary}")
    subprocess.run([str(binary), "--help"], cwd=ROOT, check=True)
    print(f"Built {binary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
