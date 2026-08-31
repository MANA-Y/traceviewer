#!/usr/bin/env python3
"""Create a portable source archive that can be built on another host."""

from __future__ import annotations

import json
import os
import subprocess
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "dist" / "traceviewer-source.zip"
ARCHIVE_ROOT_NAME = "traceviewer"
REQUIRED_FILES = (
    "README.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
    "producer/pyproject.toml",
    "docs/BUILD.md",
    "docs/AUTHORING.md",
    "scripts/bootstrap.sh",
    "scripts/build_binary.py",
)
SKIP_DIRECTORY_NAMES = {
    ".git",
    ".claude",
    ".grok",
    ".venv",
    ".venv-build",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    "test-results",
    "playwright-report",
    ".playwright-mcp",
    "materials",
}
SKIP_NAMES = {".DS_Store"}
SKIP_SUFFIXES = {".pyc", ".pyo"}
SKIP_NAME_SUFFIXES = {".egg-info"}


def _skip_relative(relative: Path) -> bool:
    if relative.name in SKIP_NAMES or relative.suffix.lower() in SKIP_SUFFIXES:
        return True
    return any(
        part in SKIP_DIRECTORY_NAMES or part.endswith(tuple(SKIP_NAME_SUFFIXES))
        for part in relative.parts
    )


def _git_tracked_and_untracked_files(root: Path) -> list[Path] | None:
    try:
        completed = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "ls-files",
                "-z",
                "--cached",
                "--others",
                "--exclude-standard",
            ],
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    files: list[Path] = []
    for raw in completed.stdout.split(b"\0"):
        if not raw:
            continue
        relative = Path(os.fsdecode(raw))
        if _skip_relative(relative):
            continue
        path = root / relative
        if path.is_file():
            files.append(path)
    return files


def list_source_files(root: Path) -> list[Path]:
    """Return source files suitable for a rebuildable archive."""
    listed = _git_tracked_and_untracked_files(root)
    if listed is not None:
        return sorted(listed, key=lambda path: path.relative_to(root).as_posix())

    files: list[Path] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if _skip_relative(relative):
            continue
        files.append(path)
    return sorted(files, key=lambda path: path.relative_to(root).as_posix())


def archive_name(root: Path, path: Path) -> str:
    relative = PurePosixPath(path.relative_to(root).as_posix())
    return str(PurePosixPath(ARCHIVE_ROOT_NAME) / relative)


def pack_source(root: Path, destination: Path) -> Path:
    """Write a zip that another host can unpack and build."""
    files = list_source_files(root)
    if not files:
        raise FileNotFoundError(f"no source files found under {root}")
    destination = destination.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        destination.unlink()

    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, arcname=archive_name(root, path))
        manifest = {
            "formatVersion": 1,
            "kind": "source",
            "fileCount": len(files),
            "docs": [
                "README.md",
                "docs/README.md",
                "docs/BUILD.md",
                "docs/AUTHORING.md",
            ],
        }
        archive.writestr(
            f"{ARCHIVE_ROOT_NAME}/traceviewer-source.json",
            json.dumps(manifest, indent=2) + "\n",
        )
    return destination


def verify_required_files(root: Path) -> None:
    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        raise FileNotFoundError(
            "source tree is incomplete:\n" + "\n".join(f"- {name}" for name in missing)
        )


def main() -> int:
    verify_required_files(ROOT)
    archive = pack_source(ROOT, DEFAULT_OUTPUT)
    size_mib = archive.stat().st_size / (1024 * 1024)
    print(f"Wrote {archive} ({size_mib:.2f} MB)")
    print("Copy the archive to the other host, unzip it, and follow docs/BUILD.md.")
    print("To write presentations, follow docs/AUTHORING.md.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
