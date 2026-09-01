import sys
import tempfile
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.targets import (  # noqa: E402
    default_asset_root,
    default_build_output,
    extra_asset_roots,
    resolve_presentation_target,
)


class TargetResolutionTest(unittest.TestCase):
    def test_dotted_module_names_pass_through(self):
        self.assertEqual(resolve_presentation_target("presentations.example"), "presentations.example")

    def test_slash_path_becomes_dotted_name_when_file_is_missing(self):
        self.assertEqual(resolve_presentation_target("presentations/demo.py"), "presentations.demo")

    def test_talk_file_in_cwd_imports_as_stem(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            (workspace / "talk.py").write_text("def main():\n    pass\n")
            self.assertEqual(resolve_presentation_target("talk.py", workspace), "talk")

    def test_nested_repo_path_stays_a_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            path = workspace / "presentations" / "example.py"
            path.parent.mkdir()
            path.write_text("def main():\n    pass\n")
            self.assertEqual(resolve_presentation_target("presentations/example.py", workspace), "presentations.example")

    def test_hyphenated_directory_uses_file_import(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            talk_dir = workspace / "my-talk"
            talk_dir.mkdir()
            (talk_dir / "talk.py").write_text("def main():\n    pass\n")
            self.assertEqual(resolve_presentation_target("my-talk/talk.py", workspace), "talk")
            self.assertIn(str(talk_dir.resolve()), sys.path)

    def test_defaults_follow_public_layout_when_present(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            (workspace / "public").mkdir()
            self.assertEqual(default_asset_root(workspace), (workspace / "public").resolve())
            self.assertEqual(default_build_output(workspace), (workspace / "public" / "var" / "traces").resolve())

    def test_defaults_use_workspace_without_public(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.assertEqual(default_asset_root(workspace), workspace.resolve())
            self.assertEqual(default_build_output(workspace), workspace.resolve())

    def test_extra_roots_skip_missing_and_duplicates(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.assertEqual(
                extra_asset_roots(workspace, workspace, workspace / "missing"),
                [workspace.resolve()],
            )


if __name__ == "__main__":
    unittest.main()
