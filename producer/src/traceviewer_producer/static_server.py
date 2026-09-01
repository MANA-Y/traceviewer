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


def packaged_viewer_path() -> Path:
    """Return the viewer files shipped inside the installed wheel."""
    path = Path(__file__).resolve().parents[1] / "traceviewer" / "viewer"
    if (path / "index.html").is_file():
        return path
    raise ViewerAssetsNotFound(f"packaged viewer is incomplete: {path}")


def find_viewer_dist(dist_path: str | Path | None = None) -> Path:
    """Resolve an explicit, configured, bundled, packaged, or source-tree viewer."""
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
        try:
            candidates.append(packaged_viewer_path())
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
        f"TraceViewer web build not found (checked: {shown}). "
        "Install a release wheel, run `npm run build` in this repository, "
        "or pass --dist-path."
    )


class ViewerRequestHandler(SimpleHTTPRequestHandler):
    """Static handler with safe SPA fallback and optional talk-asset roots."""

    def __init__(self, *args, directory: str, extra_roots: list[Path] | None = None, **kwargs):
        self.viewer_root = Path(directory).resolve()
        self.extra_roots = [Path(root).resolve() for root in extra_roots or []]
        super().__init__(*args, directory=directory, **kwargs)

    def _requested_relative(self) -> str:
        return unquote(urlsplit(self.path).path).lstrip("/")

    def _requested_path(self) -> Path | None:
        candidate = (self.viewer_root / self._requested_relative()).resolve()
        try:
            candidate.relative_to(self.viewer_root)
        except ValueError:
            return None
        return candidate

    def _extra_file(self) -> Path | None:
        relative = self._requested_relative()
        if not relative:
            return None
        for root in self.extra_roots:
            candidate = (root / relative).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                continue
            if candidate.is_file():
                return candidate
        return None

    def _send_existing_file(self, path: Path):
        try:
            handle = path.open("rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        try:
            stat = path.stat()
            self.send_response(200)
            self.send_header("Content-type", self.guess_type(str(path)))
            self.send_header("Content-Length", str(stat.st_size))
            self.send_header("Last-Modified", self.date_time_string(int(stat.st_mtime)))
            self.end_headers()
            return handle
        except Exception:
            handle.close()
            raise

    def send_head(self):
        candidate = self._requested_path()
        if candidate is None:
            self.send_error(403, "Path escapes viewer root")
            return None
        if candidate.is_file() or candidate.is_dir():
            return super().send_head()
        extra = self._extra_file()
        if extra is not None:
            return self._send_existing_file(extra)
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
    extra_roots: list[Path] | None = None,
) -> ThreadingHTTPServer:
    """Create, but do not start, a viewer HTTP server."""
    root = find_viewer_dist(dist_path)
    handler = partial(ViewerRequestHandler, directory=str(root), extra_roots=extra_roots)
    return ThreadingHTTPServer((host, port), handler)


def serve_viewer(
    host: str = "127.0.0.1",
    port: int = 4173,
    dist_path: str | Path | None = None,
    extra_roots: list[Path] | None = None,
) -> None:
    """Serve the viewer until interrupted."""
    server = create_viewer_server(host, port, dist_path, extra_roots)
    address, bound_port = server.server_address[:2]
    print(f"TraceViewer available at http://{address}:{bound_port}/")
    try:
        server.serve_forever()
    finally:
        server.server_close()
