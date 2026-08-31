import json
from dataclasses import asdict
from typing import Any

from .models import Trace


CURRENT_TRACE_FORMAT_VERSION = 2


class _Table:
    """Append-only interning table that maps a value to a stable index."""

    def __init__(self) -> None:
        self._indexes: dict[str, int] = {}
        self.values: list[Any] = []

    def intern(self, value: Any) -> int:
        key = json.dumps(value, sort_keys=True, default=str)
        index = self._indexes.get(key)
        if index is None:
            index = len(self.values)
            self._indexes[key] = index
            self.values.append(value)
        return index


def _redact_source(source: str) -> str:
    return "".join("\n" if character == "\n" else " " for character in source)


def to_audience_document(document: dict[str, Any]) -> dict[str, Any]:
    """Return a privacy-filtered view of an already serialized presenter document."""
    has_presenter_notes = any(
        rendering.get("type") == "notes"
        for renderings in document["renderings"]
        for rendering in renderings
    )
    if not has_presenter_notes:
        return document
    # Step indexes stay valid because each rendering list is filtered in place.
    # Filtering can make two lists identical; the duplicate costs a few bytes
    # and keeps this transformation a pure projection of the presenter tables.
    renderings = [
        [rendering for rendering in group if rendering.get("type") != "notes"]
        for group in document["renderings"]
    ]
    files = {
        path: _redact_source(source)
        for path, source in document["files"].items()
    }
    frames = [
        {**frame, "code": _redact_source(frame["code"])}
        if isinstance(frame, dict) and isinstance(frame.get("code"), str)
        else frame
        for frame in document["frames"]
    ]
    return {**document, "files": files, "frames": frames, "renderings": renderings}


def to_document(trace: Trace, *, include_presenter_notes: bool = False) -> dict[str, Any]:
    """Convert a trace model to the public audience or presenter contract.

    Format version 2 stores unique frames, rendering lists, and output strings
    once and refers to them from steps by index. Recorded stacks repeat heavily
    across steps, so this removes most of the snapshot payload without losing
    any information.
    """
    frames = _Table()
    renderings = _Table()
    outputs = _Table()
    steps = []
    visible_steps = {
        index
        for index, step in enumerate(trace.steps)
        if any(rendering.type != "notes" for rendering in step.renderings)
    }
    presentation_scopes = {
        (trace.steps[index].stack[-1].path, trace.steps[index].stack[-1].function_name)
        for index in visible_steps
    }
    presentation_steps = []
    seen_locations: set[tuple[str, str, int]] = set()
    for step_index, step in enumerate(trace.steps):
        stack = [frames.intern(asdict(frame)) for frame in step.stack]
        steps.append([
            stack,
            renderings.intern([asdict(rendering) for rendering in step.renderings]),
            outputs.intern(step.stdout),
            outputs.intern(step.stderr),
            step.env,
        ])
        active_frame = step.stack[-1]
        scope = (active_frame.path, active_frame.function_name)
        location = (*scope, active_frame.line_number)
        if scope in presentation_scopes and (
            location not in seen_locations or step_index in visible_steps
        ):
            presentation_steps.append(step_index)
        seen_locations.add(location)

    document = {
        "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
        "files": dict(trace.files),
        "frames": frames.values,
        "renderings": renderings.values,
        "outputs": outputs.values,
        "steps": steps,
    }
    if presentation_steps:
        document["presentationSteps"] = presentation_steps
    if not include_presenter_notes:
        document = to_audience_document(document)
    return document
