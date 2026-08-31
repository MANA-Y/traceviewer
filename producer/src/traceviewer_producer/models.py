from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class CodeLocation:
    path: str
    line_number: int


@dataclass(frozen=True)
class Reference:
    title: str | None = None
    authors: list[str] | None = None
    organization: str | None = None
    date: str | None = None
    url: str | None = None
    description: str | None = None
    notes: str | None = None


@dataclass(frozen=True)
class Rendering:
    type: str
    data: str | None = None
    language: str | None = None
    style: dict[str, str | int | float] | None = None
    external_link: Reference | None = None
    internal_link: CodeLocation | None = None
    alt: str | None = None
    focus: dict[str, float] | None = None
    overlays: list[dict[str, Any]] | None = None


@dataclass(frozen=True)
class StackFrame:
    path: str
    line_number: int
    function_name: str
    code: str
    invocation_id: int | None = None


@dataclass
class Step:
    stack: list[StackFrame]
    env: dict[str, Any]
    renderings: list[Rendering] = field(default_factory=list)
    stdout: str = ""
    stderr: str = ""


@dataclass(frozen=True)
class Trace:
    files: dict[str, str]
    steps: list[Step]
    format_version: int = 2
