"""__TITLE__ presentation."""

from traceviewer import callout, code, notes, section, text


EXAMPLE = """def greet(name):
    return f"Hello, {name}"
"""


def main():
    text("# __TITLE__")
    notes("Introduce the problem this presentation will solve.")
    text("A code-first presentation with live reload.")

    section("First section", "Introduce the problem and the goal.")
    code(EXAMPLE, "python")
    callout("Edit this file and save it. The viewer updates automatically.")
    notes("When you pack the talk, a small Made with TraceViewer credit appears in the footer.")
