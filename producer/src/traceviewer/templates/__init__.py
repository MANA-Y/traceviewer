"""Named starter talks copied into a new project."""

from __future__ import annotations

from pathlib import Path


TITLE_TOKEN = "__TITLE__"
TEMPLATES = {
    "starter": "A short first talk",
    "bug-review": "Symptom, hypothesis, diff, and fix",
    "workshop": "Prompts, recorded output, and your-turn pauses",
    "compare": "Two measurements and one verdict",
}
DEFAULT_TEMPLATE = "starter"
_FILES = {
    "starter": "starter.py",
    "bug-review": "bug_review.py",
    "workshop": "workshop.py",
    "compare": "compare.py",
}


def known_templates() -> tuple[str, ...]:
    return tuple(TEMPLATES)


def render_template(template: str, title: str) -> str:
    """Return talk source for ``template``, substituting the visible title."""
    if template not in _FILES:
        choices = ", ".join(known_templates())
        raise ValueError(f"unknown template {template!r}; choose {choices}")
    path = Path(__file__).with_name(_FILES[template])
    return path.read_text(encoding="utf-8").replace(TITLE_TOKEN, title)
