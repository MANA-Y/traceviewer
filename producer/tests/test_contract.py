import json
import sys
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
REPOSITORY_ROOT = PRODUCER_ROOT.parent
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.contract import (  # noqa: E402
    CURRENT_TRACE_FORMAT_VERSION,
    to_document,
)
from traceviewer_producer.models import Rendering, StackFrame, Step, Trace  # noqa: E402
from traceviewer_producer.validation import validate_document  # noqa: E402


class ContractTest(unittest.TestCase):
    def test_shared_fixture_uses_current_contract(self):
        fixture_path = REPOSITORY_ROOT / "fixtures/contracts/trace-v2.minimal.json"
        fixture = json.loads(fixture_path.read_text())

        self.assertEqual(fixture["formatVersion"], CURRENT_TRACE_FORMAT_VERSION)
        active_frame = fixture["frames"][fixture["steps"][0][0][-1]]
        self.assertIn(active_frame["path"], fixture["files"])

    def test_serializes_public_camel_case_version_field(self):
        trace = Trace(
            files={"talk.py": "pass\n"},
            steps=[
                Step(
                    stack=[StackFrame("talk.py", 1, "main", "pass")],
                    env={},
                )
            ],
        )

        document = to_document(trace)

        self.assertEqual(document["formatVersion"], CURRENT_TRACE_FORMAT_VERSION)
        self.assertNotIn("format_version", document)
        self.assertNotIn("presentationSteps", document)

    def test_serializes_sparse_presentation_steps(self):
        trace = Trace(
            files={"talk.py": "first\nloop\nlast\n"},
            steps=[
                Step(
                    stack=[StackFrame("talk.py", 1, "main", "first")],
                    env={},
                    renderings=[Rendering(type="markdown", data="First")],
                ),
                Step(
                    stack=[StackFrame("talk.py", 2, "benchmark", "loop")],
                    env={},
                ),
                Step(
                    stack=[StackFrame("talk.py", 3, "main", "last")],
                    env={},
                    renderings=[Rendering(type="markdown", data="Last")],
                ),
            ],
        )

        self.assertEqual(to_document(trace)["presentationSteps"], [0, 2])

    def test_audience_document_strips_notes_unless_explicitly_included(self):
        source = 'notes("Private")\n'
        trace = Trace(
            files={"talk.py": source},
            steps=[Step(
                stack=[StackFrame("talk.py", 1, "main", source.strip())],
                env={},
                renderings=[
                    Rendering(type="markdown", data="Visible"),
                    Rendering(type="notes", data='{"message":"Private"}'),
                ],
            )],
        )

        audience = to_document(trace)
        presenter = to_document(trace, include_presenter_notes=True)

        def types(document):
            return [item["type"] for item in document["renderings"][document["steps"][0][1]]]

        self.assertEqual(types(audience), ["markdown"])
        self.assertEqual(types(presenter), ["markdown", "notes"])
        self.assertNotIn("Private", audience["files"]["talk.py"])
        self.assertNotIn("Private", audience["frames"][0]["code"])
        self.assertIn("Private", presenter["frames"][0]["code"])
        self.assertEqual(audience["files"]["talk.py"].count("\n"), presenter["files"]["talk.py"].count("\n"))

    def test_python_validator_accepts_shared_fixture(self):
        fixture_path = REPOSITORY_ROOT / "fixtures/contracts/trace-v2.minimal.json"
        fixture = json.loads(fixture_path.read_text())
        self.assertEqual(validate_document(fixture), [])

    def test_python_validator_reports_locations_and_missing_sources(self):
        document = {
            "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
            "files": {"talk.py": "pass\n"},
            "frames": [{"path": "missing.py", "line_number": 0, "function_name": "main"}],
            "renderings": [[]],
            "outputs": [""],
            "steps": [[[0], 0, 0, 0, {}]],
        }
        errors = validate_document(document)
        self.assertTrue(any("source 'missing.py' is missing" in error for error in errors))
        self.assertTrue(any("positive integer" in error for error in errors))

    def test_python_validator_rejects_out_of_range_indexes(self):
        document = {
            "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
            "files": {"talk.py": "pass\n"},
            "frames": [{"path": "talk.py", "line_number": 1, "function_name": "main"}],
            "renderings": [[]],
            "outputs": [""],
            "steps": [[[3], 0, 0, 0, {}]],
        }
        errors = validate_document(document)
        self.assertTrue(any("out-of-range frame index" in error for error in errors))

    def test_python_validator_rejects_cyclic_presentation_steps(self):
        document = {
            "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
            "files": {"talk.py": "pass\n"},
            "frames": [{"path": "talk.py", "line_number": 1, "function_name": "main"}],
            "renderings": [[]],
            "outputs": [""],
            "presentationSteps": [0, 0],
            "steps": [[[0], 0, 0, 0, {}]],
        }
        errors = validate_document(document)
        self.assertTrue(any("strictly increasing" in error for error in errors))

        document["presentationSteps"] = None
        errors = validate_document(document)
        self.assertTrue(any("non-empty array" in error for error in errors))

    def test_python_validator_reports_non_string_source_instead_of_raising(self):
        document = {
            "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
            "files": {"talk.py": None},
            "frames": [{"path": "talk.py", "line_number": 1, "function_name": "main"}],
            "renderings": [[]],
            "outputs": [""],
            "steps": [[[0], 0, 0, 0, {}]],
        }
        errors = validate_document(document)
        self.assertTrue(any("expected source text" in error for error in errors))

    def test_python_validator_caps_repeated_diagnostics(self):
        document = {
            "formatVersion": CURRENT_TRACE_FORMAT_VERSION,
            "files": {"talk.py": "pass\n"},
            "frames": [
                {"path": "missing.py", "line_number": index + 1, "function_name": "main"}
                for index in range(100)
            ],
            "renderings": [[]],
            "outputs": [""],
            "steps": [[[index], 0, 0, 0, {}] for index in range(100)],
        }
        errors = validate_document(document)
        self.assertLessEqual(len(errors), 21)
        self.assertEqual(errors[-1], "additional errors omitted")


if __name__ == "__main__":
    unittest.main()
