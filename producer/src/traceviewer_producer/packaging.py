"""Portable static presentation packaging."""

from __future__ import annotations

import html
import json
import shutil
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote, urlsplit

from .static_server import find_viewer_dist
from .validation import validate_document


VIEWER_RUNTIME_DIRECTORIES = ("assets", "mathjax-fonts")


@dataclass(frozen=True)
class PackageResult:
    destination: Path
    assets: int


def copy_viewer_runtime(source: str | Path, destination: str | Path) -> Path:
    """Copy the production viewer chrome without example traces or media."""
    source = Path(source)
    destination = Path(destination)
    index = source / "index.html"
    if not index.is_file():
        raise FileNotFoundError(f"viewer build is missing index.html: {source}")
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copy2(index, destination / "index.html")
    for name in VIEWER_RUNTIME_DIRECTORIES:
        directory = source / name
        if directory.is_dir():
            shutil.copytree(directory, destination / name, dirs_exist_ok=True)
    return destination


def local_asset_references(document: dict[str, Any]) -> list[str]:
    references: set[str] = set()
    for group in document.get("renderings", []):
        for rendering in group:
            if rendering.get("type") != "image" or not isinstance(rendering.get("data"), str):
                continue
            value = rendering["data"]
            parsed = urlsplit(value)
            if parsed.scheme in {"http", "https", "data"} or parsed.netloc:
                continue
            references.add(unquote(parsed.path).lstrip("/"))
    return sorted(references)


def _safe_relative_path(reference: str) -> Path | None:
    path = PurePosixPath(reference)
    if not reference or path.is_absolute() or ".." in path.parts:
        return None
    return Path(*path.parts)


def validate_assets(document: dict[str, Any], asset_root: str | Path) -> list[str]:
    root = Path(asset_root).expanduser().resolve()
    errors: list[str] = []
    for reference in local_asset_references(document):
        relative = _safe_relative_path(reference)
        if relative is None:
            errors.append(f"asset {reference!r}: path must stay inside the asset root")
            continue
        source = (root / relative).resolve()
        try:
            source.relative_to(root)
        except ValueError:
            errors.append(f"asset {reference!r}: path escapes the asset root")
            continue
        if not source.is_file():
            errors.append(f"asset {reference!r}: file not found under {root}")
    return errors


def pack_document(
    document: dict[str, Any],
    destination: str | Path,
    *,
    viewer_dist: str | Path | None = None,
    asset_root: str | Path = "public",
    force: bool = False,
) -> PackageResult:
    errors = [*validate_document(document), *validate_assets(document, asset_root)]
    if errors:
        raise ValueError("Cannot pack invalid trace:\n" + "\n".join(f"- {error}" for error in errors))

    output = Path(destination).expanduser().resolve()
    if output.exists():
        if not force:
            raise FileExistsError(f"package destination already exists: {output}")
        shutil.rmtree(output)
    viewer = find_viewer_dist(viewer_dist)
    copy_viewer_runtime(viewer, output)

    trace_name = "trace.json"
    (output / trace_name).write_text(
        json.dumps(document, separators=(",", ":")), encoding="utf-8"
    )
    root = Path(asset_root).expanduser().resolve()
    references = local_asset_references(document)
    for reference in references:
        relative = _safe_relative_path(reference)
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / relative, target)

    index = output / "index.html"
    markup = index.read_text(encoding="utf-8")
    meta = f'    <meta name="traceviewer-default-trace" content="{html.escape(trace_name, quote=True)}" />\n'
    if "</head>" not in markup:
        raise ValueError(f"viewer index has no </head>: {index}")
    index.write_text(markup.replace("</head>", meta + "  </head>", 1), encoding="utf-8")
    (output / "traceviewer-package.json").write_text(json.dumps({
        "formatVersion": 1,
        "trace": trace_name,
        "assets": references,
    }, indent=2), encoding="utf-8")
    return PackageResult(output, len(references))
