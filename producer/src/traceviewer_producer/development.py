"""One-command local viewer and live producer orchestration."""

from __future__ import annotations

import asyncio
import threading
from pathlib import Path

from .live import development_origins, run_live
from .static_server import create_viewer_server


def run_development(
    module_name: str,
    *,
    viewer_host: str = "127.0.0.1",
    viewer_port: int = 4173,
    live_host: str = "127.0.0.1",
    live_port: int = 8765,
    dist_path: str | Path | None = None,
    inspect_all_variables: bool = False,
    open_browser: bool = True,
) -> None:
    """Serve the built viewer and run live authoring until interrupted."""
    server = create_viewer_server(viewer_host, viewer_port, dist_path)
    thread = threading.Thread(target=server.serve_forever, name="traceviewer-http", daemon=True)
    thread.start()
    bound_host, bound_port = server.server_address[:2]
    browser_host = "127.0.0.1" if bound_host in {"0.0.0.0", "::"} else bound_host
    viewer_url = f"http://{browser_host}:{bound_port}/"
    print(f"Viewer URL: {viewer_url}")
    try:
        asyncio.run(run_live(
            module_name,
            host=live_host,
            port=live_port,
            origins=development_origins(viewer_url),
            inspect_all_variables=inspect_all_variables,
            open_browser=open_browser,
            viewer_url=viewer_url,
        ))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
