"""Create a small, readable standalone talk project."""

from __future__ import annotations

import re
from pathlib import Path


MODULE_SLUG = re.compile(r"^[a-z][a-z0-9_]*$")
PROJECT_SLUG = re.compile(r"^[a-z][a-z0-9_-]*$")
GITIGNORE = """\
.venv/
__pycache__/
*.py[cod]
dist/
*.egg-info/
.DS_Store
"""


def validate_module_slug(value: str) -> str:
    """Return a safe Python module slug or raise a user-facing error."""
    if not MODULE_SLUG.fullmatch(value):
        raise ValueError(
            "name must be a lowercase Python module slug "
            "(letters, numbers, underscores; start with a letter)"
        )
    return value


def validate_project_name(value: str) -> str:
    """Return a directory name for a new talk project."""
    if not PROJECT_SLUG.fullmatch(value):
        raise ValueError(
            "name must be a lowercase directory "
            "(letters, numbers, hyphens, underscores; start with a letter)"
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


def project_title(name: str) -> str:
    return name.replace("_", " ").replace("-", " ").title()


def starter_source(name: str) -> str:
    """Build the initial source for a new presentation."""
    title = project_title(name)
    return f'''"""{title} presentation."""

from traceviewer import callout, code, notes, section, text


EXAMPLE = """def greet(name):
    return f"Hello, {{name}}"
"""


def main():
    text("# {title}")
    notes("Introduce the problem this presentation will solve.")
    text("A code-first presentation with live reload.")

    section("First section", "Introduce the problem and the goal.")
    code(EXAMPLE, "python")
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


def create_talk_project(
    name: str,
    *,
    parent: Path = Path("."),
    force: bool = False,
) -> Path:
    """Create ``<name>/talk.py`` and return the talk file path."""
    slug = validate_project_name(name)
    root = Path(parent) / slug
    destination = root / "talk.py"
    if root.exists() and root.is_file():
        raise FileExistsError(f"{root} exists and is not a directory")
    if destination.exists() and not force:
        raise FileExistsError(f"{destination} already exists (use --force to replace it)")
    if root.exists() and not force and any(path.name != "assets" for path in root.iterdir()):
        raise FileExistsError(f"{root} already exists (use --force to replace talk.py)")
    root.mkdir(parents=True, exist_ok=True)
    (root / "assets").mkdir(exist_ok=True)
    gitignore = root / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text(GITIGNORE, encoding="utf-8")
    destination.write_text(starter_source(slug), encoding="utf-8")
    return destination
