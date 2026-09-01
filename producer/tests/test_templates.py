import os
import sys
import tempfile
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer.templates import TEMPLATES, known_templates, render_template  # noqa: E402
from traceviewer_producer.capture import execute  # noqa: E402
from traceviewer_producer.scaffold import create_talk_project  # noqa: E402
from traceviewer_producer.targets import resolve_presentation_target  # noqa: E402


class TemplateCatalogTest(unittest.TestCase):
    def test_catalog_lists_the_shipped_shapes(self):
        self.assertEqual(known_templates(), ("starter", "bug-review", "workshop", "compare"))
        for name in known_templates():
            self.assertTrue(TEMPLATES[name])

    def test_each_template_renders_the_title_and_executes(self):
        for name in known_templates():
            with self.subTest(template=name):
                source = render_template(name, "Latency Review")
                self.assertIn("# Latency Review", source)
                self.assertNotIn("__TITLE__", source)
                compile(source, f"{name}.py", "exec")
                with tempfile.TemporaryDirectory() as temp_dir:
                    destination = create_talk_project(
                        "demo", parent=Path(temp_dir), template=name
                    )
                    previous = Path.cwd()
                    try:
                        os.chdir(destination.parent)
                        trace = execute(resolve_presentation_target("talk.py"))
                    finally:
                        os.chdir(previous)
                    self.assertGreater(len(trace.steps), 0)


if __name__ == "__main__":
    unittest.main()
