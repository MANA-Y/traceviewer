"""Create a small, readable presentation module."""

from __future__ import annotations

import re
from pathlib import Path


MODULE_SLUG = re.compile(r"^[a-z][a-z0-9_]*$")


def validate_module_slug(value: str) -> str:
    """Return a safe Python module slug or raise a user-facing error."""
    if not MODULE_SLUG.fullmatch(value):
        raise ValueError(
            "name must be a lowercase Python module slug "
            "(letters, numbers, underscores; start with a letter)"
        )
    return value


def module_name_for_directory(directory: Path, slug: str, workspace: Path | None = None) -> str:
    """Return the importable dotted module name for a workspace directory."""
    validate_module_slug(slug)
    workspace = (workspace or Path.cwd()).resolve()
    try:
        relative = directory.resolve().relative_to(workspace)
    except ValueError as error:
        raise ValueError("directory must be inside the current workspace") from error
    if not relative.parts or any(not part.isidentifier() for part in relative.parts):
        raise ValueError("directory path must contain only valid Python package names")
    return ".".join((*relative.parts, slug))


def starter_source(name: str) -> str:
    """Build the initial source for a new presentation."""
    title = name.replace("_", " ").title()
    return f'''"""{title} presentation."""

from execute_util import callout, code, notes, section, text


EXAMPLE = """void main() {{
  print('Hello from TraceViewer');
}}"""


def main():
    text("# {title}")
    notes("Introduce the problem this presentation will solve.")
    text("A code-first presentation with live reload.")

    section("First section", "Introduce the problem and the goal.")
    code(EXAMPLE, "dart")
    callout("Edit this file and save it. The viewer updates automatically.")
'''


def create_presentation(
    name: str,
    *,
    directory: Path = Path("presentations"),
    force: bool = False,
) -> Path:
    """Create a presentation module and return its path."""
    slug = validate_module_slug(name)
    destination = directory / f"{slug}.py"
    if destination.exists() and not force:
        raise FileExistsError(f"{destination} already exists (use --force to replace it)")
    directory.mkdir(parents=True, exist_ok=True)
    destination.write_text(starter_source(slug), encoding="utf-8")
    return destination
