"""Copy the production viewer into the wheel at package build time."""

from __future__ import annotations

import shutil
from pathlib import Path


SKIP_NAMES = {".DS_Store", "var"}
VIEWER_GITIGNORE = "*\n!.gitignore\n"


def _repo_viewer_dist() -> Path | None:
    """Return this repository's Vite ``dist/`` when the layout is recognizable."""
    here = Path(__file__).resolve().parent
    for repo in (here, *here.parents):
        dist = repo / "dist"
        if (
            (dist / "index.html").is_file()
            and (repo / "package.json").is_file()
            and (repo / "producer").is_dir()
        ):
            return dist
    return None


def packaged_viewer_dir() -> Path:
    return Path(__file__).resolve().parent / "viewer"


def sync_viewer_assets() -> Path | None:
    """Copy ``dist/`` into ``traceviewer/viewer``, omitting example traces."""
    source = _repo_viewer_dist()
    if source is None:
        return None
    destination = packaged_viewer_dir()
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    for item in source.iterdir():
        if item.name in SKIP_NAMES:
            continue
        target = destination / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy2(item, target)
    (destination / ".gitignore").write_text(VIEWER_GITIGNORE, encoding="utf-8")
    if not (destination / "index.html").is_file():
        raise FileNotFoundError(f"viewer copy is missing index.html: {destination}")
    return destination


def __getattr__(name: str):
    if name != "build_py":
        raise AttributeError(name)
    from setuptools.command.build_py import build_py as _build_py

    class build_py(_build_py):
        def run(self) -> None:
            sync_viewer_assets()
            super().run()

    return build_py
