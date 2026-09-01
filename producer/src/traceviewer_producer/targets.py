"""Resolve presentation modules from dotted names or filesystem paths."""

from __future__ import annotations

import sys
from pathlib import Path


def _ensure_import_path(directory: Path) -> None:
    entry = str(directory.resolve())
    if entry not in sys.path:
        sys.path.insert(0, entry)


def _module_name_for_file(path: Path, workspace: Path) -> str:
    _ensure_import_path(path.parent)
    try:
        relative = path.relative_to(workspace)
    except ValueError:
        return path.stem
    parts = (*relative.parts[:-1], relative.stem)
    if all(part.isidentifier() for part in parts):
        return ".".join(parts)
    return path.stem


def resolve_presentation_target(target: str, workspace: Path | None = None) -> str:
    """Return an importable module name for a dotted path or a ``.py`` file."""
    workspace = (workspace or Path.cwd()).resolve()
    raw = target.strip()
    path_hint = Path(raw)
    looks_like_path = path_hint.suffix == ".py" or "/" in raw or "\\" in raw

    if looks_like_path:
        path = path_hint.expanduser()
        if not path.is_absolute():
            path = workspace / path
        if path.suffix != ".py":
            path = path.with_suffix(".py")
        if path.is_file():
            return _module_name_for_file(path.resolve(), workspace)
        dotted = raw.removesuffix(".py").replace("\\", "/").replace("/", ".")
        if all(part.isidentifier() for part in dotted.split(".")):
            return dotted
        raise ValueError(f"Presentation not found: {target}")

    existing = path_hint.expanduser()
    if not existing.is_absolute():
        existing = workspace / existing
    if existing.is_file():
        return _module_name_for_file(existing.resolve(), workspace)
    return raw


def default_asset_root(workspace: Path | None = None) -> Path:
    """Prefer this repository's ``public/`` tree; otherwise the talk directory."""
    workspace = (workspace or Path.cwd()).resolve()
    public = workspace / "public"
    return public if public.is_dir() else workspace


def default_build_output(workspace: Path | None = None) -> Path:
    """Write snapshots under ``public/var/traces`` when that layout exists."""
    workspace = (workspace or Path.cwd()).resolve()
    public = workspace / "public"
    if public.is_dir():
        return public / "var" / "traces"
    return workspace


def extra_asset_roots(*paths: Path | None) -> list[Path]:
    """Deduplicate existing directories used as live-image search roots."""
    roots: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        if path is None:
            continue
        resolved = Path(path).expanduser().resolve()
        if resolved in seen or not resolved.is_dir():
            continue
        seen.add(resolved)
        roots.append(resolved)
    return roots
