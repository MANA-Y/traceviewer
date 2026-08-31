"""Validation helpers shared by CLI commands and future packaging tools."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .contract import CURRENT_TRACE_FORMAT_VERSION


MAX_FILES = 10_000
MAX_STEPS = 1_000_000
MAX_STACK_DEPTH = 1_000
MAX_ERRORS = 20


def _is_index(value: Any, table: list[Any]) -> bool:
    return not isinstance(value, bool) and isinstance(value, int) and 0 <= value < len(table)


def validate_document(document: Any) -> list[str]:
    """Return actionable contract errors for a serialized trace document."""
    errors: list[str] = []
    if not isinstance(document, dict):
        return ["trace: expected an object"]

    if document.get("formatVersion") != CURRENT_TRACE_FORMAT_VERSION:
        errors.append(
            f"formatVersion: expected {CURRENT_TRACE_FORMAT_VERSION}, "
            f"got {document.get('formatVersion')!r}"
        )

    files = document.get("files")
    if not isinstance(files, dict) or not files:
        errors.append("files: expected a non-empty object of source strings")
        files = {}
    elif len(files) > MAX_FILES:
        errors.append(f"files: maximum is {MAX_FILES}, got {len(files)}")
    else:
        for path, source in files.items():
            if not isinstance(path, str) or not path:
                errors.append("files: every path must be a non-empty string")
                break
            if not isinstance(source, str):
                errors.append(f"files[{path!r}]: expected source text")

    frames = document.get("frames")
    if not isinstance(frames, list):
        errors.append("frames: expected an array of unique stack frames")
        frames = []
    rendering_groups = document.get("renderings")
    if not isinstance(rendering_groups, list):
        errors.append("renderings: expected an array of rendering lists")
        rendering_groups = []
    outputs = document.get("outputs")
    if not isinstance(outputs, list) or any(not isinstance(item, str) for item in outputs):
        errors.append("outputs: expected an array of strings")
        outputs = []

    steps = document.get("steps")
    if not isinstance(steps, list) or not steps:
        errors.append("steps: expected a non-empty array")
        return errors
    if len(steps) > MAX_STEPS:
        errors.append(f"steps: maximum is {MAX_STEPS}, got {len(steps)}")

    if "presentationSteps" in document:
        presentation_steps = document["presentationSteps"]
        if not isinstance(presentation_steps, list) or not presentation_steps:
            errors.append("presentationSteps: expected a non-empty array")
        else:
            previous = -1
            for index, step_index in enumerate(presentation_steps):
                if not _is_index(step_index, steps):
                    errors.append(
                        f"presentationSteps[{index}]: expected a valid step index"
                    )
                    break
                if step_index <= previous:
                    errors.append("presentationSteps: expected strictly increasing indexes")
                    break
                previous = step_index

    # A frame only has to resolve against files where it is the active frame.
    active_frames: set[int] = set()
    truncated = False
    for step_index, step in enumerate(steps):
        if len(errors) >= MAX_ERRORS:
            truncated = True
            break
        prefix = f"steps[{step_index}]"
        if not isinstance(step, list) or len(step) != 5:
            errors.append(
                f"{prefix}: expected a [frames, renderings, stdout, stderr, env] tuple"
            )
            continue
        stack, renderings_id, stdout_id, stderr_id, env = step
        if not isinstance(stack, list) or not stack:
            errors.append(f"{prefix}[0]: expected a non-empty array of frame indexes")
        elif len(stack) > MAX_STACK_DEPTH:
            errors.append(
                f"{prefix}[0]: maximum depth is {MAX_STACK_DEPTH}, got {len(stack)}"
            )
        elif any(not _is_index(index, frames) for index in stack):
            errors.append(f"{prefix}[0]: contains an out-of-range frame index")
        else:
            active_frames.add(stack[-1])
        if not _is_index(renderings_id, rendering_groups):
            errors.append(f"{prefix}[1]: expected a valid renderings index")
        if not _is_index(stdout_id, outputs):
            errors.append(f"{prefix}[2]: expected a valid outputs index")
        if not _is_index(stderr_id, outputs):
            errors.append(f"{prefix}[3]: expected a valid outputs index")
        if not isinstance(env, dict):
            errors.append(f"{prefix}[4]: expected an object")

    for frame_index, frame in enumerate(frames):
        if len(errors) >= MAX_ERRORS:
            truncated = True
            break
        frame_prefix = f"frames[{frame_index}]"
        if not isinstance(frame, dict):
            errors.append(f"{frame_prefix}: expected an object")
            continue
        path = frame.get("path")
        line_number = frame.get("line_number")
        is_active = frame_index in active_frames
        if not isinstance(path, str) or not path:
            errors.append(f"{frame_prefix}.path: expected a non-empty string")
        elif is_active and path not in files:
            errors.append(f"{frame_prefix}.path: source {path!r} is missing from files")
        if isinstance(line_number, bool) or not isinstance(line_number, int) or line_number < 1:
            errors.append(f"{frame_prefix}.line_number: expected a positive integer")
        elif (
            is_active
            and isinstance(files.get(path), str)
            and line_number > max(1, len(files[path].splitlines()))
        ):
            errors.append(
                f"{frame_prefix}.line_number: {line_number} is outside {path!r}"
            )
        if not isinstance(frame.get("function_name"), str):
            errors.append(f"{frame_prefix}.function_name: expected a string")

    for group_index, group in enumerate(rendering_groups):
        if len(errors) >= MAX_ERRORS:
            truncated = True
            break
        if not isinstance(group, list):
            errors.append(f"renderings[{group_index}]: expected an array")
            continue
        for rendering_index, rendering in enumerate(group):
            if len(errors) >= MAX_ERRORS:
                truncated = True
                break
            rendering_prefix = f"renderings[{group_index}][{rendering_index}]"
            if not isinstance(rendering, dict):
                errors.append(f"{rendering_prefix}: expected an object")
            elif not isinstance(rendering.get("type"), str) or not rendering["type"]:
                errors.append(f"{rendering_prefix}.type: expected a non-empty string")

    if truncated or len(errors) > MAX_ERRORS:
        return [*errors[:MAX_ERRORS], "additional errors omitted"]
    return errors


def load_document(path: str | Path) -> dict[str, Any]:
    """Read one JSON trace and preserve a useful filename in parse errors."""
    source = Path(path)
    try:
        value = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(
            f"{source}:{error.lineno}:{error.colno}: invalid JSON: {error.msg}"
        ) from error
    if not isinstance(value, dict):
        raise ValueError(f"{source}: trace root must be an object")
    return value
