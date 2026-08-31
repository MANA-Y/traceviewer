import difflib
import inspect
import json
import os
import re
import shlex
import subprocess
import time
from contextvars import ContextVar
from pathlib import Path
from typing import Callable

from .assets import cache_url, relativize
from .models import CodeLocation, Reference, Rendering
from .references import fetch_arxiv_reference, is_arxiv_url


_rendering_buffer: ContextVar[list[Rendering] | None] = ContextVar(
    "traceviewer_renderings",
    default=None,
)


def _buffer() -> list[Rendering]:
    buffer = _rendering_buffer.get()
    if buffer is None:
        buffer = []
        _rendering_buffer.set(buffer)
    return buffer


def pop_renderings() -> list[Rendering]:
    buffer = _buffer()
    renderings = buffer.copy()
    buffer.clear()
    return renderings


def clear_renderings() -> None:
    _buffer().clear()


def text(message: str, style: dict | None = None, verbatim: bool = False) -> None:
    safe_style = dict(style or {})
    messages = message.split("\n") if verbatim else [message]
    if verbatim:
        safe_style = {"fontFamily": "monospace", "whiteSpace": "pre", **safe_style}
    for line in messages:
        _buffer().append(Rendering(type="markdown", data=line, style=safe_style))


def code(source: str, language: str, style: dict | None = None) -> None:
    """Render a syntax-highlighted source or shell snippet."""
    if not isinstance(source, str) or not isinstance(language, str) or not language:
        raise TypeError("code() requires source text and a non-empty language")
    _buffer().append(
        Rendering(type="code", data=source, language=language.lower(), style=dict(style or {}))
    )


def _structured(rendering_type: str, payload: dict, style: dict | None = None) -> None:
    _buffer().append(
        Rendering(type=rendering_type, data=json.dumps(payload), style=dict(style or {}))
    )


def table(headers: list[str], rows: list[list], caption: str | None = None) -> None:
    if not headers or any(len(row) != len(headers) for row in rows):
        raise ValueError("table() requires headers and equally sized rows")
    _structured("table", {"headers": headers, "rows": rows, "caption": caption})


def chart(labels: list[str], series: dict[str, list[float]], kind: str = "line") -> None:
    if kind not in {"line", "bar"} or not labels or not series:
        raise ValueError("chart() requires line/bar kind, labels, and series")
    if any(len(values) != len(labels) for values in series.values()):
        raise ValueError("Every chart series must match the labels length")
    _structured("chart", {"labels": labels, "series": series, "kind": kind})


_COLOR_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _timeline_color(value: object, label: str) -> str:
    if not isinstance(value, str) or not _COLOR_RE.match(value):
        raise ValueError(f"timeline() {label} color must be a #hex value")
    return value


def _timeline_span(span: dict, label: str) -> dict:
    if not isinstance(span, dict):
        raise TypeError(f"timeline() {label} must be a mapping")
    start, duration = span.get("start"), span.get("duration")
    if not _is_finite_number(start) or not _is_finite_number(duration):
        raise TypeError(f"timeline() {label} requires numeric start and duration")
    if float(duration) < 0:
        raise ValueError(f"timeline() {label} duration must be >= 0")
    kind = span.get("kind") or "span"
    if kind not in {"span", "wait"}:
        raise ValueError(f"timeline() {label} kind must be span or wait")
    result = {"start": float(start), "duration": float(duration), "kind": kind}
    if span.get("series") is not None:
        if not isinstance(span["series"], str) or not span["series"].strip():
            raise ValueError(f"timeline() {label} series must be a non-empty string")
        result["series"] = span["series"]
    if span.get("color") is not None:
        result["color"] = _timeline_color(span["color"], label)
    return result


def _timeline_lane(lane: dict, index: int) -> dict:
    label = f"lanes[{index}]"
    if not isinstance(lane, dict):
        raise TypeError(f"timeline() {label} must be a mapping")
    name = lane.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ValueError(f"timeline() {label} requires a non-empty name")
    result: dict = {"name": name}
    if lane.get("color") is not None:
        result["color"] = _timeline_color(lane["color"], label)
    if "spans" in lane:
        spans = lane["spans"]
        if not isinstance(spans, list) or not spans:
            raise ValueError(f"timeline() {label} spans must be a non-empty list")
        result["spans"] = [
            _timeline_span(span, f"{label}.spans[{span_index}]")
            for span_index, span in enumerate(spans)
        ]
        return result
    result.update(_timeline_span(lane, label))
    return result


def timeline(
    lanes: list[dict],
    title: str | None = None,
    unit: str = "ms",
    compress: str | None = "wait",
    series: list[str] | None = None,
    colors: dict[str, str] | None = None,
) -> None:
    """Render a Gantt-style averaged timeline with optional wait compression."""
    if not isinstance(lanes, list) or not lanes:
        raise ValueError("timeline() requires a non-empty list of lanes")
    if compress is not None and compress not in {"wait"}:
        raise ValueError("timeline() compress must be 'wait' or None")
    if title is not None and not isinstance(title, str):
        raise TypeError("timeline() title must be a string")
    if not isinstance(unit, str) or not unit.strip():
        raise ValueError("timeline() requires a non-empty unit")
    payload: dict = {
        "lanes": [_timeline_lane(lane, index) for index, lane in enumerate(lanes)],
        "unit": unit,
        "compress": compress,
        "title": title,
    }
    if series is not None:
        if (
            not isinstance(series, list)
            or not series
            or any(not isinstance(item, str) or not item.strip() for item in series)
        ):
            raise ValueError("timeline() series must be a non-empty list of strings")
        payload["series"] = list(series)
    if colors is not None:
        if not isinstance(colors, dict) or not colors:
            raise TypeError("timeline() colors must map names to color strings")
        payload["colors"] = {
            str(name): _timeline_color(value, f"colors[{name}]")
            for name, value in colors.items()
        }
    _structured("timeline", payload)


_GRAPH_NODE_KINDS = {"flow", "wait", "compute", "ui", "cycle"}
_GRAPH_EDGE_KINDS = {"flow", "cycle"}
_GRAPH_MAX_NODES = 32
_GRAPH_MAX_EDGES = 64


def _graph_id(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"graph() {label} must be a non-empty string")
    return value.strip()


def _optional_int(value: object, label: str, minimum: int = 0) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"graph() {label} must be an integer")
    if value < minimum:
        raise ValueError(f"graph() {label} must be >= {minimum}")
    return value


def _graph_node(node: object, index: int) -> dict:
    label = f"nodes[{index}]"
    if isinstance(node, str):
        node_id = _graph_id(node, label)
        return {"id": node_id, "label": node_id, "kind": "flow"}
    if isinstance(node, (tuple, list)):
        if len(node) < 1:
            raise ValueError(f"graph() {label} requires an id")
        node_id = _graph_id(node[0], f"{label}[0]")
        title = str(node[1]) if len(node) > 1 and node[1] is not None else node_id
        result = {"id": node_id, "label": title, "kind": "flow"}
        if len(node) > 2 and node[2]:
            result["subtitle"] = str(node[2])
        return result
    if not isinstance(node, dict):
        raise TypeError(f"graph() {label} must be a string, pair, or mapping")
    node_id = _graph_id(node.get("id") or node.get("name"), label)
    title = node.get("label") or node.get("title") or node_id
    if not isinstance(title, str) or not title.strip():
        raise ValueError(f"graph() {label} requires a non-empty label")
    kind = node.get("kind") or "flow"
    if kind not in _GRAPH_NODE_KINDS:
        raise ValueError(f"graph() {label} kind must be one of {sorted(_GRAPH_NODE_KINDS)}")
    result = {"id": node_id, "label": title.strip(), "kind": kind}
    subtitle = node.get("subtitle") or node.get("description")
    if subtitle:
        if not isinstance(subtitle, str):
            raise TypeError(f"graph() {label} subtitle must be a string")
        result["subtitle"] = subtitle
    lane = _optional_int(node.get("lane"), f"{label}.lane")
    column = _optional_int(node.get("column"), f"{label}.column")
    if lane is not None:
        result["lane"] = lane
    if column is not None:
        result["column"] = column
    if node.get("color") is not None:
        result["color"] = _timeline_color(node["color"], label)
    return result


def _graph_edge(edge: object, index: int, node_ids: set[str]) -> dict:
    label = f"edges[{index}]"
    if isinstance(edge, (tuple, list)):
        if len(edge) < 2:
            raise ValueError(f"graph() {label} requires from and to")
        source, target = _graph_id(edge[0], f"{label}[0]"), _graph_id(edge[1], f"{label}[1]")
        kind = edge[3] if len(edge) > 3 and edge[3] else "flow"
        result = {"from": source, "to": target, "kind": kind}
        if len(edge) > 2 and edge[2]:
            result["label"] = str(edge[2])
    elif isinstance(edge, dict):
        source = _graph_id(edge.get("from") or edge.get("source"), f"{label}.from")
        target = _graph_id(edge.get("to") or edge.get("target"), f"{label}.to")
        kind = edge.get("kind") or "flow"
        result = {"from": source, "to": target, "kind": kind}
        if edge.get("label"):
            if not isinstance(edge["label"], str):
                raise TypeError(f"graph() {label} label must be a string")
            result["label"] = edge["label"]
    else:
        raise TypeError(f"graph() {label} must be a pair or mapping")
    if result["kind"] not in _GRAPH_EDGE_KINDS:
        raise ValueError(f"graph() {label} kind must be flow or cycle")
    if result["from"] not in node_ids or result["to"] not in node_ids:
        raise ValueError(f"graph() {label} references an unknown node")
    return result


def graph(
    nodes: list,
    edges: list,
    title: str | None = None,
    lanes: list[str] | None = None,
    style: dict | None = None,
) -> None:
    """Render a stage graph with connections and highlighted cycles."""
    if not isinstance(nodes, list) or not nodes:
        raise ValueError("graph() requires a non-empty list of nodes")
    if len(nodes) > _GRAPH_MAX_NODES:
        raise ValueError(f"graph() supports at most {_GRAPH_MAX_NODES} nodes")
    if not isinstance(edges, list):
        raise TypeError("graph() edges must be a list")
    if len(edges) > _GRAPH_MAX_EDGES:
        raise ValueError(f"graph() supports at most {_GRAPH_MAX_EDGES} edges")
    if title is not None and not isinstance(title, str):
        raise TypeError("graph() title must be a string")
    parsed_nodes = [_graph_node(node, index) for index, node in enumerate(nodes)]
    seen: set[str] = set()
    for node in parsed_nodes:
        if node["id"] in seen:
            raise ValueError(f"graph() duplicate node id: {node['id']}")
        seen.add(node["id"])
    parsed_edges = [_graph_edge(edge, index, seen) for index, edge in enumerate(edges)]
    payload: dict = {"nodes": parsed_nodes, "edges": parsed_edges, "title": title}
    if lanes is not None:
        if (
            not isinstance(lanes, list)
            or not lanes
            or any(not isinstance(item, str) or not item.strip() for item in lanes)
        ):
            raise ValueError("graph() lanes must be a non-empty list of strings")
        payload["lanes"] = [item.strip() for item in lanes]
    _structured("graph", payload, style=style)


def callout(message: str, tone: str = "info", title: str | None = None) -> None:
    if tone not in {"info", "success", "warning", "danger"}:
        raise ValueError("Unsupported callout tone")
    _structured("callout", {"message": message, "tone": tone, "title": title})


def columns(*cells: str, gap: str = "normal") -> None:
    if len(cells) < 2 or len(cells) > 4 or gap not in {"compact", "normal", "wide"}:
        raise ValueError("columns() requires 2-4 Markdown cells and a supported gap")
    _structured("columns", {"cells": cells, "gap": gap})


def metrics(items: dict[str, str | int | float]) -> None:
    if not items:
        raise ValueError("metrics() requires at least one item")
    _structured("metrics", {"items": items})


def quote(message: str, attribution: str | None = None) -> None:
    _structured("quote", {"message": message, "attribution": attribution})


def divider(label: str | None = None) -> None:
    _structured("divider", {"label": label})


def steps(
    items: list[tuple[str, str] | list[str] | dict[str, str] | str],
    *,
    layout: str = "list",
    style: dict | None = None,
) -> None:
    """Render a structured step list / agenda item sequence.

    Items can be:
    - pairs/tuples/lists of (title, description), e.g. [("Контекст", "Экраны и метрики"), ...]
    - dicts with 'title' and optional 'description', e.g. [{"title": "...", "description": "..."}, ...]
    - single strings, e.g. ["Контекст", "Методика", ...]

    Each item carries its position and the viewer prints it as a badge, so titles
    need no numbering of their own; a leading "01." in a title is dropped instead
    of showing up twice.
    """
    if not items or not isinstance(items, (list, tuple)):
        raise ValueError("steps() requires a non-empty list of items")
    parsed_items = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, (tuple, list)):
            if len(item) >= 2:
                title, desc = str(item[0]), str(item[1])
            elif len(item) == 1:
                title, desc = str(item[0]), ""
            else:
                title, desc = f"Шаг {index}", ""
        elif isinstance(item, dict):
            title = str(item.get("title") or item.get("name") or f"Шаг {index}")
            desc = str(item.get("description") or item.get("subtitle") or item.get("desc") or "")
        elif isinstance(item, str):
            title = item
            desc = ""
        else:
            title = str(item)
            desc = ""
        parsed_items.append({"index": index, "title": title, "description": desc})

    _structured("steps", {"items": parsed_items, "layout": layout}, style=style)


def section(title: str, subtitle: str | None = None) -> None:
    if not title:
        raise ValueError("section() requires a title")
    _structured("section", {"title": title, "subtitle": subtitle})


def notes(message: str) -> None:
    """Attach presenter-only notes to the current presentation step."""
    if not isinstance(message, str):
        raise TypeError("notes() requires a string message")
    if not message.strip():
        raise ValueError("notes() requires a non-empty message")
    _structured("notes", {"message": message})


def diff(before: str, after: str, language: str = "text") -> None:
    lines = difflib.unified_diff(
        before.splitlines(), after.splitlines(), fromfile="before", tofile="after", lineterm=""
    )
    _structured("diff", {"content": "\n".join(lines), "language": language})


def image(
    url: str,
    style: dict | None = None,
    width: int | str | None = None,
    alt: str | None = None,
    focus: dict | None = None,
    overlays: list[dict] | None = None,
) -> None:
    """Render an image with optional percentage-based focus and callouts.

    A focus rectangle uses ``x``, ``y``, ``width``, and ``height`` in the
    0–100 image coordinate space. Overlays require ``x``, ``y``, and ``text``;
    an overlay can include its own ``focus`` rectangle to highlight a region.
    """
    safe_focus = _image_focus(focus, "focus") if focus is not None else None
    safe_overlays = _image_overlays(overlays)
    safe_style = dict(style or {})
    if width is not None:
        safe_style["width"] = width
    if url.startswith(("http://", "https://")):
        path = cache_url(url, "image")
    else:
        file_path = Path(url)
        if not file_path.exists() and (Path("public") / file_path).exists():
            file_path = Path("public") / file_path
        if not file_path.exists():
            raise ValueError(f"Image not found: {url}")
        try:
            path = file_path.resolve().relative_to(Path("public").resolve()).as_posix()
        except ValueError:
            path = file_path.as_posix()
        if not path.startswith(("/", "http://", "https://", "data:")):
            path = f"/{path}"
    _buffer().append(Rendering(
        type="image",
        data=path,
        style=safe_style,
        alt=alt,
        focus=safe_focus,
        overlays=safe_overlays,
    ))


def _image_focus(value: dict, label: str) -> dict[str, float]:
    if not isinstance(value, dict):
        raise TypeError(f"image() {label} must be a mapping")
    keys = ("x", "y", "width", "height")
    if any(isinstance(value.get(key), bool) or not isinstance(value.get(key), (int, float)) for key in keys):
        raise TypeError(f"image() {label} requires numeric x, y, width, and height")
    result = {key: float(value[key]) for key in keys}
    if (result["x"] < 0 or result["y"] < 0 or result["width"] <= 0 or
            result["height"] <= 0 or result["x"] + result["width"] > 100 or
            result["y"] + result["height"] > 100):
        raise ValueError(f"image() {label} must fit inside the 0–100 image area")
    return result


def _image_overlays(values: list[dict] | None) -> list[dict] | None:
    if values is None:
        return None
    if not isinstance(values, list):
        raise TypeError("image() overlays must be a list")
    result = []
    for index, value in enumerate(values):
        label = f"overlays[{index}]"
        if not isinstance(value, dict):
            raise TypeError(f"image() {label} must be a mapping")
        x, y, message = value.get("x"), value.get("y"), value.get("text")
        if (isinstance(x, bool) or not isinstance(x, (int, float)) or
                isinstance(y, bool) or not isinstance(y, (int, float))):
            raise TypeError(f"image() {label} requires numeric x and y")
        if not 0 <= float(x) <= 100 or not 0 <= float(y) <= 100:
            raise ValueError(f"image() {label} x and y must be between 0 and 100")
        if not isinstance(message, str) or not message.strip():
            raise ValueError(f"image() {label} requires non-empty text")
        overlay = {"x": float(x), "y": float(y), "text": message}
        if value.get("title") is not None:
            if not isinstance(value["title"], str):
                raise TypeError(f"image() {label} title must be a string")
            overlay["title"] = value["title"]
        if value.get("focus") is not None:
            overlay["focus"] = _image_focus(value["focus"], f"{label}.focus")
        result.append(overlay)
    return result


def link(
    arg: type | Callable | Reference | str | None = None,
    style: dict | None = None,
    **reference_fields,
) -> None:
    safe_style = dict(style or {})
    if arg is None:
        reference = Reference(**reference_fields)
        _buffer().append(Rendering(type="link", style=safe_style, external_link=reference))
    elif isinstance(arg, Reference):
        _buffer().append(Rendering(type="link", style=safe_style, external_link=arg))
    elif isinstance(arg, type) or callable(arg):
        path = inspect.getfile(arg)
        _, line_number = inspect.getsourcelines(arg)
        location = CodeLocation(relativize(path), line_number)
        _buffer().append(
            Rendering(
                type="link",
                data=arg.__name__,
                style=safe_style,
                internal_link=location,
            )
        )
    elif isinstance(arg, str):
        reference = fetch_arxiv_reference(arg) if is_arxiv_url(arg) else Reference(url=arg)
        _buffer().append(Rendering(type="link", style=safe_style, external_link=reference))
    else:
        raise TypeError(f"Unsupported link target: {type(arg).__name__}")


def shell(command: str | list[str]) -> None:
    """Run a command without a system shell and render its plain-text output."""
    arguments = shlex.split(command) if isinstance(command, str) else list(command)
    if not arguments:
        raise ValueError("shell() requires a non-empty command")
    output = subprocess.check_output(arguments, text=True)
    output = re.sub(r"\x1b\[[0-9;]*m", "", output)
    text(output, verbatim=True)


def terminal(command: str | list[str]) -> None:
    """Run a command and render command, streams, exit code, and duration."""
    arguments = shlex.split(command) if isinstance(command, str) else list(command)
    if not arguments:
        raise ValueError("terminal() requires a non-empty command")
    started = time.perf_counter()
    result = subprocess.run(arguments, text=True, capture_output=True, check=False)
    duration_ms = (time.perf_counter() - started) * 1000
    _structured("terminal", {
        "command": shlex.join(arguments),
        "stdout": re.sub(r"\x1b\[[0-9;]*m", "", result.stdout),
        "stderr": re.sub(r"\x1b\[[0-9;]*m", "", result.stderr),
        "exitCode": result.returncode,
        "durationMs": round(duration_ms, 2),
    })


def system_text(command: str | list[str]) -> None:
    """Compatibility alias for presentations authored before `shell()`."""
    shell(command)
