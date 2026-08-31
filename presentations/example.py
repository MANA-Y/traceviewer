from execute_util import callout, code, notes, section, text
from presentations.example_content import TAGLINE


SAMPLE = """text("# Title")
code("print(42)", "python")
callout("Save. The browser updates.")
"""


def main():
    text("# TraceViewer")
    notes("Share the presenter URL. This overlay is only for you.")
    text(TAGLINE)
    section("Nodes", "Each helper call is one reveal")
    text("Markdown, code, images, tables, charts, callouts, diffs, and terminal output.")
    notes("Keep long samples in constants so audience line numbers stay clean.")
    code(SAMPLE, "python")
    callout("Step with the keys or the bottom scrubber. Long talks scroll by section.", tone="success")
