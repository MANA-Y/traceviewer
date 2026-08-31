"""Compatibility imports for existing code-first presentations."""

import sys
from pathlib import Path


PRODUCER_SRC = Path(__file__).parent / "producer" / "src"
sys.path.insert(0, str(PRODUCER_SRC))

from traceviewer_producer import (  # noqa: E402,F401
    CodeLocation,
    Reference,
    Rendering,
    callout,
    chart,
    code,
    columns,
    diff,
    divider,
    graph,
    image,
    link,
    metrics,
    notes,
    quote,
    section,
    shell,
    steps,
    system_text,
    table,
    terminal,
    text,
    timeline,
)

__all__ = [
    "CodeLocation",
    "Reference",
    "Rendering",
    "callout",
    "chart",
    "code",
    "columns",
    "diff",
    "divider",
    "graph",
    "image",
    "link",
    "metrics",
    "notes",
    "quote",
    "section",
    "shell",
    "steps",
    "system_text",
    "table",
    "terminal",
    "text",
    "timeline",
]
