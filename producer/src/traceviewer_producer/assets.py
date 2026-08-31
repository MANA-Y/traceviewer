import hashlib
import os
import re
import urllib.request
from pathlib import Path


def ensure_directory(path: str | Path) -> Path:
    directory = Path(path)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def relativize(path: str | Path) -> str:
    return os.path.relpath(Path(path).resolve(), Path.cwd())


def download_file(url: str, destination: str | Path) -> Path:
    path = Path(destination)
    if path.exists():
        return path
    ensure_directory(path.parent)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "TraceViewerProducer/0.1"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        path.write_bytes(response.read())
    return path


def cache_url(url: str, prefix: str) -> str:
    cache_dir = ensure_directory(
        os.environ.get("TRACEVIEWER_ASSET_DIR", "public/var/files")
    )
    public_prefix = os.environ.get("TRACEVIEWER_ASSET_URL_PREFIX", "var/files").strip("/")
    safe_name = re.sub(r"[^\w.-]+", "_", url)[:160]
    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    filename = f"{prefix}-{url_hash}-{safe_name}"
    download_file(url, cache_dir / filename)
    return f"{public_prefix}/{filename}"
