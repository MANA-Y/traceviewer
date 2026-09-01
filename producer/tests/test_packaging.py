import json
import sys
import tempfile
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
REPOSITORY_ROOT = PRODUCER_ROOT.parent
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.packaging import (  # noqa: E402
    copy_viewer_runtime,
    local_asset_references,
    pack_document,
    validate_assets,
)


def fixture_document():
    return json.loads(
        (REPOSITORY_ROOT / "fixtures/contracts/trace-v2.minimal.json").read_text()
    )


class PackagingTest(unittest.TestCase):
    def test_collects_only_local_image_assets(self):
        document = fixture_document()
        document["renderings"][0].extend([
            {"type": "image", "data": "var/chart.png?revision=1"},
            {"type": "image", "data": "https://example.test/chart.png"},
            {"type": "image", "data": "data:image/png;base64,AA=="},
        ])
        self.assertEqual(local_asset_references(document), ["var/chart.png"])

    def test_asset_validation_reports_missing_and_unsafe_paths(self):
        document = fixture_document()
        document["renderings"][0] = [
            {"type": "image", "data": "missing.png"},
            {"type": "image", "data": "../secret.png"},
        ]
        with tempfile.TemporaryDirectory() as temp_dir:
            errors = validate_assets(document, temp_dir)
        self.assertEqual(len(errors), 2)
        self.assertTrue(any("file not found" in error for error in errors))
        self.assertTrue(any("inside the asset root" in error for error in errors))

    def test_pack_copies_viewer_trace_and_assets(self):
        document = fixture_document()
        document["renderings"][0].append({"type": "image", "data": "var/chart.png"})
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            viewer = root / "viewer"
            viewer.mkdir()
            (viewer / "index.html").write_text("<html><head></head><body></body></html>")
            (viewer / "assets").mkdir()
            (viewer / "assets/app.js").write_text("export {}")
            (viewer / "mathjax-fonts").mkdir()
            (viewer / "mathjax-fonts/MathJax_Main-Regular.woff").write_bytes(b"woff")
            (viewer / "var" / "traces").mkdir(parents=True)
            (viewer / "var" / "traces" / "demo.json").write_text("{}")
            (viewer / "var" / "extra.png").write_bytes(b"png")
            asset_root = root / "public"
            (asset_root / "var").mkdir(parents=True)
            (asset_root / "var/chart.png").write_bytes(b"png")
            output = root / "package"

            result = pack_document(
                document, output, viewer_dist=viewer, asset_root=asset_root
            )

            self.assertEqual(result.assets, 1)
            self.assertEqual((output / "var/chart.png").read_bytes(), b"png")
            self.assertFalse((output / "var" / "extra.png").exists())
            self.assertFalse((output / "var" / "traces").exists())
            self.assertEqual(
                (output / "mathjax-fonts/MathJax_Main-Regular.woff").read_bytes(),
                b"woff",
            )
            self.assertEqual(json.loads((output / "trace.json").read_text()), document)
            markup = (output / "index.html").read_text()
            self.assertIn("traceviewer-default-trace", markup)
            self.assertIn("Made with TraceViewer", markup)
            manifest = json.loads((output / "traceviewer-package.json").read_text())
            self.assertEqual(manifest["assets"], ["var/chart.png"])
            self.assertEqual(manifest["credit"], "Made with TraceViewer")

    def test_copy_viewer_runtime_rejects_incomplete_viewer(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "viewer"
            source.mkdir()
            with self.assertRaises(FileNotFoundError):
                copy_viewer_runtime(source, Path(temp_dir) / "out")

    def test_pack_refuses_to_replace_existing_destination(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            output = root / "package"
            output.mkdir()
            with self.assertRaises(FileExistsError):
                pack_document(fixture_document(), output, viewer_dist=root)


if __name__ == "__main__":
    unittest.main()
