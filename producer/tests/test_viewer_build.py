import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer._build import sync_viewer_assets  # noqa: E402


class ViewerBuildTest(unittest.TestCase):
    def test_sync_copies_runtime_and_skips_example_traces(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "dist"
            destination = root / "viewer"
            (source / "assets").mkdir(parents=True)
            (source / "index.html").write_text("<html></html>")
            (source / "assets" / "app.js").write_text("export {}")
            (source / "var" / "traces").mkdir(parents=True)
            (source / "var" / "traces" / "demo.json").write_text("{}")
            (source / ".DS_Store").write_bytes(b"")

            with patch("traceviewer._build._repo_viewer_dist", return_value=source), patch(
                "traceviewer._build.packaged_viewer_dir", return_value=destination
            ):
                result = sync_viewer_assets()

            self.assertEqual(result, destination)
            self.assertEqual((destination / "index.html").read_text(), "<html></html>")
            self.assertEqual((destination / "assets" / "app.js").read_text(), "export {}")
            self.assertFalse((destination / "var").exists())
            self.assertFalse((destination / ".DS_Store").exists())
            self.assertIn("!.gitignore", (destination / ".gitignore").read_text())

    def test_sync_is_a_no_op_without_a_repository_dist(self):
        with patch("traceviewer._build._repo_viewer_dist", return_value=None):
            self.assertIsNone(sync_viewer_assets())


if __name__ == "__main__":
    unittest.main()
