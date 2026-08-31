"""Serve the built TraceViewer application from source or a bundled executable."""

from __future__ import annotations

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class ViewerAssetsNotFound(FileNotFoundError):
    """Raised when no usable viewer distribution can be located."""


def bundled_viewer_path() -> Path:
    """Return the viewer distribution embedded by PyInstaller."""
    bundle_root = getattr(sys, "_MEIPASS", None)
    if not bundle_root:
        raise ViewerAssetsNotFound("the current process has no bundled viewer")
    path = Path(bundle_root) / "traceviewer_viewer"
    if not (path / "index.html").is_file():
        raise ViewerAssetsNotFound(f"bundled viewer is incomplete: {path}")
    return path


def find_viewer_dist(dist_path: str | Path | None = None) -> Path:
    """Resolve an explicit, configured, bundled, or source-tree viewer build."""
    candidates: list[Path] = []
    if dist_path is not None:
        candidates.append(Path(dist_path))
    elif configured := os.environ.get("TRACEVIEWER_DIST"):
        candidates.append(Path(configured))
    else:
        try:
            candidates.append(bundled_viewer_path())
        except ViewerAssetsNotFound:
            pass
        candidates.append(Path.cwd() / "dist")
        candidates.append(Path(__file__).resolve().parents[3] / "dist")

    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if (resolved / "index.html").is_file():
            return resolved
    shown = ", ".join(str(path) for path in candidates) or "<none>"
    raise ViewerAssetsNotFound(
        f"TraceViewer web build not found (checked: {shown}). Run `npm run build` "
        "or pass --dist-path."
    )


class ViewerRequestHandler(SimpleHTTPRequestHandler):
    """Static handler with safe SPA fallback for client-side routes."""

    def __init__(self, *args, directory: str, **kwargs):
        self.viewer_root = Path(directory).resolve()
        super().__init__(*args, directory=directory, **kwargs)

    def _requested_path(self) -> Path | None:
        relative = unquote(urlsplit(self.path).path).lstrip("/")
        candidate = (self.viewer_root / relative).resolve()
        try:
            candidate.relative_to(self.viewer_root)
        except ValueError:
            return None
        return candidate

    def send_head(self):
        candidate = self._requested_path()
        if candidate is None:
            self.send_error(403, "Path escapes viewer root")
            return None
        if candidate.is_file() or candidate.is_dir():
            return super().send_head()
        # Missing files with a suffix are assets, not client-side routes.
        if candidate.suffix:
            self.send_error(404, "File not found")
            return None
        self.path = "/index.html"
        return super().send_head()


def create_viewer_server(
    host: str = "127.0.0.1",
    port: int = 4173,
    dist_path: str | Path | None = None,
) -> ThreadingHTTPServer:
    """Create, but do not start, a viewer HTTP server."""
    root = find_viewer_dist(dist_path)
    handler = partial(ViewerRequestHandler, directory=str(root))
    return ThreadingHTTPServer((host, port), handler)


def serve_viewer(
    host: str = "127.0.0.1",
    port: int = 4173,
    dist_path: str | Path | None = None,
) -> None:
    """Serve the viewer until interrupted."""
    server = create_viewer_server(host, port, dist_path)
    address, bound_port = server.server_address[:2]
    print(f"TraceViewer available at http://{address}:{bound_port}/")
    try:
        server.serve_forever()
    finally:
        server.server_close()
