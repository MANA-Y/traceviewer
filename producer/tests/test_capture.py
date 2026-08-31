import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.capture import execute  # noqa: E402


class CaptureTest(unittest.TestCase):
    def test_captures_renderings_and_inspected_values(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            module_path = directory / "sample_talk.py"
            module_path.write_text(
                textwrap.dedent(
                    """
                    from traceviewer_producer import text

                    def child():
                        value = 42  # @inspect value
                        return value

                    def main():
                        text("# Hello")
                        result = child()  # @inspect result
                    """
                ).lstrip()
            )
            sys.path.insert(0, str(directory))
            try:
                trace = execute("sample_talk")
            finally:
                sys.path.remove(str(directory))
                sys.modules.pop("sample_talk", None)

        self.assertTrue(list(trace.files)[0].endswith("sample_talk.py"))
        self.assertGreaterEqual(len(trace.steps), 4)
        self.assertTrue(
            any(
                rendering.type == "markdown" and rendering.data == "# Hello"
                for step in trace.steps
                for rendering in step.renderings
            )
        )
        environments = [step.env for step in trace.steps if step.env]
        self.assertIn({"value": 42}, environments)
        self.assertIn({"result": 42}, environments)
        self.assertTrue(
            all(
                isinstance(frame.invocation_id, int)
                for step in trace.steps
                for frame in step.stack
            )
        )

    def test_repeated_calls_receive_distinct_invocation_ids(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            module_path = directory / "sample_calls.py"
            module_path.write_text(
                textwrap.dedent(
                    """
                    def child(value):
                        captured = value  # @inspect captured

                    def main():
                        child(1)
                        child(2)
                    """
                ).lstrip()
            )
            sys.path.insert(0, str(directory))
            try:
                trace = execute("sample_calls")
            finally:
                sys.path.remove(str(directory))
                sys.modules.pop("sample_calls", None)

        child_ids = {
            step.stack[-1].invocation_id
            for step in trace.steps
            if step.stack[-1].function_name == "child"
        }
        self.assertEqual(len(child_ids), 2)

    def test_notes_attach_to_visible_content_without_adding_a_step(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            module_path = directory / "sample_notes.py"
            module_path.write_text(
                textwrap.dedent(
                    '''
                    from traceviewer_producer import notes, text

                    def main():
                        text("# First")
                        notes("Introduce the topic")
                        notes("Pause here")
                        text("Second")
                    '''
                ).lstrip()
            )
            sys.path.insert(0, str(directory))
            try:
                trace = execute("sample_notes")
            finally:
                sys.path.remove(str(directory))
                sys.modules.pop("sample_notes", None)

        note_steps = [
            step
            for step in trace.steps
            if any(rendering.type == "notes" for rendering in step.renderings)
        ]
        self.assertEqual(len(note_steps), 1)
        self.assertEqual(
            [rendering.type for rendering in note_steps[0].renderings],
            ["markdown", "notes", "notes"],
        )
        self.assertFalse(
            any(
                step.renderings
                and all(rendering.type == "notes" for rendering in step.renderings)
                for step in trace.steps
            )
        )


if __name__ == "__main__":
    unittest.main()
