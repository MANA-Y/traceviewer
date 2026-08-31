import importlib
import inspect
import linecache
import re
import sys
from pathlib import Path
from types import FrameType, ModuleType
from typing import Callable

from .assets import relativize
from .models import StackFrame, Step, Trace
from .renderings import clear_renderings, pop_renderings
from .serialization import to_serializable


INSPECT_PATTERN = re.compile(r"@inspect\s+(\w+)")


def _merge_presenter_notes(steps: list[Step]) -> list[Step]:
    """Attach note-only calls to visible content without creating playback steps."""
    visible_indexes = [index for index, step in enumerate(steps)
                       if any(rendering.type != "notes" for rendering in step.renderings)]
    first_visible = visible_indexes[0] if visible_indexes else None
    merged_indexes: set[int] = set()
    last_visible: int | None = None
    for index, step in enumerate(steps):
        if any(rendering.type != "notes" for rendering in step.renderings):
            last_visible = index
            continue
        if not step.renderings or not all(rendering.type == "notes" for rendering in step.renderings):
            continue
        target_index = last_visible if last_visible is not None else first_visible
        if target_index is not None:
            steps[target_index].renderings.extend(step.renderings)
            merged_indexes.add(index)

    return [step for index, step in enumerate(steps) if index not in merged_indexes]


def get_inspect_variables(code: str) -> list[str]:
    return INSPECT_PATTERN.findall(code)


def _source_line(frame: FrameType) -> str:
    return linecache.getline(frame.f_code.co_filename, frame.f_lineno).rstrip("\n")


def _build_stack(
    frame: FrameType,
    visible_paths: set[Path],
    invocation_ids: dict[int, int],
    next_invocation_id: list[int],
) -> list[StackFrame]:
    frames: list[StackFrame] = []
    current: FrameType | None = frame
    while current is not None:
        path = Path(current.f_code.co_filename).resolve()
        if path in visible_paths:
            frame_id = id(current)
            invocation_id = invocation_ids.get(frame_id)
            if invocation_id is None:
                invocation_id = next_invocation_id[0]
                next_invocation_id[0] += 1
                invocation_ids[frame_id] = invocation_id
            frames.append(
                StackFrame(
                    path=relativize(path),
                    line_number=current.f_lineno,
                    function_name=current.f_code.co_name,
                    code=_source_line(current),
                    invocation_id=invocation_id,
                )
            )
        current = current.f_back
    frames.reverse()
    return frames


def _module_source(module: ModuleType) -> Path:
    path = inspect.getsourcefile(module)
    if path is None:
        raise ValueError(f"Module {module.__name__!r} has no Python source file")
    return Path(path).resolve()


def execute(module_name: str, inspect_all_variables: bool = False) -> Trace:
    """Execute `module.main()` and return a legacy-compatible trace."""
    module = importlib.import_module(module_name)
    main = getattr(module, "main", None)
    if not callable(main):
        raise ValueError(f"Module {module_name!r} must define a callable main()")

    source_path = _module_source(module)
    visible_paths = {source_path}
    steps: list[Step] = []
    pending: dict[FrameType, tuple[int, str]] = {}
    invocation_ids: dict[int, int] = {}
    next_invocation_id = [0]
    clear_renderings()

    def finalize(frame: FrameType) -> None:
        pending_step = pending.pop(frame, None)
        if pending_step is None:
            return
        step_index, code = pending_step
        step = steps[step_index]
        variables = frame.f_locals.keys() if inspect_all_variables else get_inspect_variables(code)
        for variable in variables:
            if variable in frame.f_locals:
                step.env[variable] = to_serializable(frame.f_locals[variable])
        step.renderings = pop_renderings()

    def local_trace(frame: FrameType, event: str, _arg):
        if event == "line":
            finalize(frame)
            stack = _build_stack(frame, visible_paths, invocation_ids, next_invocation_id)
            if not stack:
                return local_trace
            if steps and steps[-1].stack == stack:
                step_index = len(steps) - 1
            else:
                steps.append(Step(stack=stack, env={}))
                step_index = len(steps) - 1
            pending[frame] = (step_index, _source_line(frame))
        elif event in {"return", "exception"}:
            finalize(frame)
            if event == "return":
                invocation_ids.pop(id(frame), None)
        return local_trace

    def global_trace(frame: FrameType, event: str, _arg):
        if event != "call" or Path(frame.f_code.co_filename).resolve() not in visible_paths:
            return None
        return local_trace

    previous_trace: Callable | None = sys.gettrace()
    try:
        sys.settrace(global_trace)
        main()
    finally:
        sys.settrace(previous_trace)
        for frame in list(pending):
            finalize(frame)
        clear_renderings()

    return Trace(
        files={relativize(source_path): source_path.read_text()},
        steps=_merge_presenter_notes(steps),
    )
