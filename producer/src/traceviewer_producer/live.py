import asyncio
import importlib.util
import json
import secrets
import sys
import webbrowser
from collections import deque
from pathlib import Path
from typing import Awaitable, Callable
from urllib.parse import parse_qs, parse_qsl, urlencode, urlsplit, urlunsplit

from .capture import execute
from .contract import to_audience_document, to_document
from .protocol import EventFactory


def authorize_request(path: str, origin: str | None, token: str, allowed_origins: set[str]) -> int | None:
    supplied_token = parse_qs(urlsplit(path).query).get("token", [None])[0]
    if not secrets.compare_digest(supplied_token or "", token):
        return 401
    if origin not in allowed_origins:
        return 403
    return None


def authorize_role_request(
    path: str,
    origin: str | None,
    tokens: dict[str, str],
    allowed_origins: set[str],
) -> tuple[str | None, int | None]:
    """Authorize a WebSocket request and return its immutable connection role."""
    supplied_token = parse_qs(urlsplit(path).query).get("token", [None])[0] or ""
    role = next(
        (role for role, token in tokens.items() if secrets.compare_digest(supplied_token, token)),
        None,
    )
    if role is None:
        return None, 401
    if origin not in allowed_origins:
        return None, 403
    return role, None


def websocket_url(host: str, port: int, public_url: str | None = None) -> str:
    """Return the externally reachable WebSocket endpoint."""
    if public_url is None:
        return f"ws://{host}:{port}/"
    parsed = urlsplit(public_url)
    scheme = {"http": "ws", "https": "wss", "ws": "ws", "wss": "wss"}.get(parsed.scheme)
    if scheme is None or not parsed.netloc:
        raise ValueError("Public URL must be an absolute http(s) or ws(s) URL")
    return urlunsplit((scheme, parsed.netloc, parsed.path or "/", parsed.query, ""))


def viewer_live_url(
    viewer_url: str,
    host: str,
    port: int,
    token: str,
    *,
    role: str | None = None,
    view: str | None = None,
    public_url: str | None = None,
) -> str:
    """Build a viewer URL without discarding an existing query or fragment."""
    parsed = urlsplit(viewer_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Viewer URL must be an absolute http(s) URL")
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.update({"live": websocket_url(host, port, public_url), "token": token})
    if role is not None:
        query["role"] = role
    if view is not None:
        query["view"] = view
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path or "/", urlencode(query), parsed.fragment))


def _filter_audience_trace(trace: dict) -> dict:
    return to_audience_document(trace)


def event_for_role(event: dict, role: str) -> dict | None:
    """Remove presenter-only renderings before an event crosses the audience boundary."""
    if role == "audience" and event.get("type") in {"diagnostic", "error"}:
        return None
    if event.get("type") == "execution_reset":
        payload = event.get("payload", {})
        presenter = role == "presenter"
        filtered_payload = {
            "formatVersion": payload.get("formatVersion"),
            "files": payload.get("files") if presenter else payload.get("audienceFiles", {}),
            "frames": (
                payload.get("frames", []) if presenter
                else payload.get("audienceFrames", payload.get("frames", []))
            ),
            "outputs": payload.get("outputs", []),
            "renderings": (
                payload.get("renderings", []) if presenter
                else payload.get("audienceRenderings", [])
            ),
        }
        if "presentationSteps" in payload:
            filtered_payload["presentationSteps"] = payload["presentationSteps"]
        return {**event, "payload": filtered_payload}
    if event.get("type") == "hello":
        payload = dict(event.get("payload") or {})
        if role != "presenter":
            payload.pop("audienceUrl", None)
            payload.pop("notesUrl", None)
        return {**event, "payload": payload}
    if event.get("type") == "trace_snapshot" and role == "audience":
        payload = event.get("payload", {})
        trace = payload.get("trace")
        if not isinstance(trace, dict):
            return None
        return {**event, "payload": {**payload, "trace": _filter_audience_trace(trace)}}
    # Version 2 steps only carry indexes into the tables sent with
    # execution_reset, so filtering the audience rendering table there is
    # enough; appended steps contain no presenter content of their own.
    return event


LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})
LOCAL_DEV_PORTS = (4173, 5173)


def viewer_origin(viewer_url: str) -> str:
    parsed = urlsplit(viewer_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Viewer URL must be an absolute http(s) URL")
    return f"{parsed.scheme}://{parsed.netloc}"


def origin_aliases(origin: str) -> set[str]:
    """Treat loopback host aliases as the same browser origin."""
    parsed = urlsplit(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return {origin}
    hosts = {parsed.hostname}
    if parsed.hostname in LOOPBACK_HOSTS:
        hosts.update(LOOPBACK_HOSTS)
    aliases = set()
    for host in hosts:
        netloc = f"{host}:{parsed.port}" if parsed.port else host
        aliases.add(urlunsplit((parsed.scheme, netloc, "", "", "")))
    return aliases


def expand_allowed_origins(origins: set[str]) -> set[str]:
    expanded: set[str] = set()
    for origin in origins:
        expanded.update(origin_aliases(origin))
    return expanded


def development_origins(viewer_url: str) -> set[str]:
    """Allow the static viewer, Vite, and localhost/127.0.0.1 aliases."""
    origins = {viewer_origin(viewer_url)}
    for port in LOCAL_DEV_PORTS:
        origins.add(f"http://127.0.0.1:{port}")
        origins.add(f"http://localhost:{port}")
    return expand_allowed_origins(origins)


def presentation_step_from_message(message: object) -> int | None:
    """Return a validated presenter step control or ignore the message."""
    if not isinstance(message, dict) or message.get("type") != "set_step":
        return None
    step_index = message.get("stepIndex")
    if isinstance(step_index, bool) or not isinstance(step_index, int) or step_index < 0:
        return None
    return step_index


def _websocket_serve():
    try:
        from websockets.server import serve
    except ImportError as error:
        raise RuntimeError(
            "Live mode requires: python -m pip install 'traceviewer[live]'"
        ) from error
    return serve


def _module_path(module_name: str) -> Path:
    spec = importlib.util.find_spec(module_name)
    if spec is None or spec.origin is None:
        raise ValueError(f"Cannot locate presentation module {module_name!r}")
    return Path(spec.origin).resolve()


def local_modules(root: Path) -> dict[str, Path]:
    """Return loaded Python source modules owned by the presentation workspace."""
    root = root.resolve()
    result = {}
    producer_package = (root / "producer" / "src" / "traceviewer_producer").resolve()
    for name, module in tuple(sys.modules.items()):
        if name == "__main__":
            continue
        raw_path = getattr(module, "__file__", None)
        if raw_path is None:
            continue
        path = Path(raw_path).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            continue
        if path.suffix == ".py" and not path.is_relative_to(producer_package):
            result[name] = path
    return result


async def run_live(
    module_name: str,
    host: str = "127.0.0.1",
    port: int = 8765,
    origins: set[str] | None = None,
    inspect_all_variables: bool = False,
    poll_interval: float = 0.25,
    open_browser: bool = False,
    viewer_url: str = "http://localhost:5173/",
    allow_remote: bool = False,
    public_url: str | None = None,
    presenter_message_handler: Callable[[dict], Awaitable[None] | None] | None = None,
) -> None:
    if host not in {"127.0.0.1", "::1", "localhost"} and not allow_remote:
        raise ValueError("Non-loopback live binding requires allow_remote=True")

    serve = _websocket_serve()
    audience_token = secrets.token_urlsafe(24)
    presenter_token = secrets.token_urlsafe(24)
    if secrets.compare_digest(audience_token, presenter_token):
        presenter_token = f"{presenter_token}.presenter"
    tokens = {"audience": audience_token, "presenter": presenter_token}
    audience_viewer_url = viewer_live_url(
        viewer_url, host, port, audience_token, role="audience", public_url=public_url
    )
    presenter_viewer_url = viewer_live_url(
        viewer_url, host, port, presenter_token, role="presenter", public_url=public_url
    )
    notes_viewer_url = viewer_live_url(
        viewer_url, host, port, presenter_token,
        role="presenter", view="notes", public_url=public_url,
    )
    if origins:
        allowed_origins = expand_allowed_origins(set(origins))
    else:
        allowed_origins = expand_allowed_origins({
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            viewer_origin(viewer_url),
        })
    module_path = _module_path(module_name)
    workspace_root = Path.cwd().resolve()
    factory = EventFactory()
    clients: dict[object, str] = {}
    history = deque(maxlen=50_000)
    hello_event = factory.make("hello", {
        "module": module_name,
        "audienceUrl": audience_viewer_url,
        "notesUrl": notes_viewer_url,
    })
    history.append(hello_event)
    last_valid_events: list[dict] = []
    latest_diagnostic: dict | None = None
    current_presentation_state: dict | None = None
    watched_modules = {module_name: module_path}

    async def broadcast(event: dict) -> None:
        history.append(event)
        if not clients:
            return
        encoded_by_role = {}
        for role in set(clients.values()):
            filtered = event_for_role(event, role)
            encoded_by_role[role] = json.dumps(filtered) if filtered is not None else None

        async def send_one(client, role: str) -> None:
            encoded = encoded_by_role[role]
            if encoded is None:
                return
            try:
                await asyncio.wait_for(client.send(encoded), timeout=2.0)
            except Exception:
                clients.pop(client, None)
                try:
                    await client.close(code=1011, reason="Client is too slow")
                except Exception:
                    pass

        await asyncio.gather(*(send_one(client, role) for client, role in tuple(clients.items())))

    async def rebuild() -> None:
        nonlocal last_valid_events, latest_diagnostic, watched_modules
        factory.start_revision()
        revision_events = []
        try:
            importlib.invalidate_caches()
            for loaded_name in watched_modules:
                sys.modules.pop(loaded_name, None)
            trace = await asyncio.to_thread(execute, module_name, inspect_all_variables)
            # The canonical in-memory history contains presenter data. Audience
            # filtering happens immediately before every send and replay.
            document = to_document(trace, include_presenter_notes=True)
            audience_document = to_audience_document(document)
            reset_payload = {
                "formatVersion": document["formatVersion"],
                "files": document["files"],
                "audienceFiles": audience_document["files"],
                "frames": document["frames"],
                "audienceFrames": audience_document["frames"],
                "outputs": document["outputs"],
                "renderings": document["renderings"],
                "audienceRenderings": audience_document["renderings"],
            }
            if "presentationSteps" in document:
                reset_payload["presentationSteps"] = document["presentationSteps"]
            reset = factory.make("execution_reset", reset_payload)
            revision_events.append(reset)
            await broadcast(reset)
            for offset in range(0, len(document["steps"]), 128):
                append = factory.make("step_append", {
                    "offset": offset,
                    "steps": document["steps"][offset:offset + 128],
                })
                revision_events.append(append)
                await broadcast(append)
            complete = factory.make("complete", {"stepCount": len(trace.steps)})
            revision_events.append(complete)
            await broadcast(complete)
            last_valid_events = revision_events
            latest_diagnostic = None
            watched_modules = local_modules(workspace_root)
            watched_modules[module_name] = module_path
        except Exception as error:  # A broken revision must keep the previous snapshot playable.
            latest_diagnostic = factory.make("diagnostic", {
                "message": str(error),
                "exceptionType": type(error).__name__,
                "path": str(module_path),
            })
            await broadcast(latest_diagnostic)

    async def watch() -> None:
        mtimes: dict[Path, int] = {}
        while True:
            paths = set(watched_modules.values())
            current = {path: path.stat().st_mtime_ns for path in paths if path.exists()}
            if current != mtimes:
                mtimes = current
                await rebuild()
                mtimes = {
                    path: path.stat().st_mtime_ns
                    for path in set(watched_modules.values())
                    if path.exists()
                }
            await asyncio.sleep(poll_interval)

    async def handler(websocket, _path=None) -> None:
        nonlocal current_presentation_state
        request_path = _path or getattr(websocket, "path", "/")
        role, rejection = authorize_role_request(
            request_path,
            getattr(websocket, "request_headers", {}).get("Origin"),
            tokens,
            allowed_origins,
        )
        if rejection is not None or role is None:
            await websocket.close(code=1008, reason="Connection is not authorized")
            return
        clients[websocket] = role
        try:
            query = parse_qs(urlsplit(request_path).query)
            requested_session = query.get("sessionId", [None])[0]
            try:
                after = int(query.get("after", ["-1"])[0])
            except ValueError:
                after = -1
            oldest_sequence = history[0]["sequence"] if history else factory.sequence
            if requested_session == factory.session_id and after >= oldest_sequence - 1:
                events = [event for event in history if event["sequence"] > after]
            else:
                events = [hello_event, *last_valid_events]
                if latest_diagnostic is not None:
                    events.append(latest_diagnostic)
                if current_presentation_state is not None:
                    current_presentation_state = factory.make(
                        "presentation_state",
                        current_presentation_state["payload"],
                    )
                    history.append(current_presentation_state)
                    events.append(current_presentation_state)
            for event in events:
                filtered = event_for_role(event, role)
                if filtered is not None:
                    await asyncio.wait_for(websocket.send(json.dumps(filtered)), timeout=2.0)
            if role == "presenter":
                async for raw_message in websocket:
                    try:
                        message = json.loads(raw_message)
                    except (json.JSONDecodeError, TypeError):
                        continue
                    if (step_index := presentation_step_from_message(message)) is not None:
                        current_presentation_state = factory.make(
                            "presentation_state", {"stepIndex": step_index}
                        )
                        await broadcast(current_presentation_state)
                    if presenter_message_handler is not None:
                        result = presenter_message_handler(message)
                        if result is not None:
                            await result
            else:
                async for _raw_message in websocket:
                    await websocket.close(code=1008, reason="Audience connections are read-only")
                    break
        finally:
            clients.pop(websocket, None)

    async def authorize(path, request_headers):
        _role, rejection = authorize_role_request(
            path, request_headers.get("Origin"), tokens, allowed_origins
        )
        if rejection is not None:
            return rejection, [], b"Connection rejected\n"
        return None

    print(f"Presenter URL: {presenter_viewer_url}")
    print(f"Notes URL (optional phone): {notes_viewer_url}")
    print(f"Audience URL: {audience_viewer_url}")
    async with serve(
        handler,
        host,
        port,
        process_request=authorize,
        max_size=64 * 1024,
        max_queue=4,
        ping_interval=20,
        ping_timeout=20,
    ):
        if open_browser:
            webbrowser.open(presenter_viewer_url)
        await watch()
