import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "build_binary.py"


def load_build_binary():
    spec = importlib.util.spec_from_file_location("build_binary", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class BuildBinaryTest(unittest.TestCase):
    def test_stage_viewer_copies_web_assets_and_skips_native_binaries(self):
        build_binary = load_build_binary()
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "dist"
            destination = Path(temp_dir) / "stage"
            (source / "assets").mkdir(parents=True)
            (source / "mathjax-fonts").mkdir(parents=True)
            (source / "index.html").write_text("<html></html>")
            (source / "assets" / "app.js").write_text("export {}")
            (source / "mathjax-fonts" / "MathJax_Main-Regular.woff").write_bytes(b"woff")
            (source / "traceviewer").write_bytes(b"elf")
            (source / "var" / "traces").mkdir(parents=True)
            (source / "var" / "traces" / "demo.json").write_text("{}")
            (source / "var" / "extra.png").write_bytes(b"png")
            (source / "var" / "plugin.so").write_bytes(b"so")

            staged = build_binary.stage_viewer(source, destination)

            self.assertEqual((staged / "index.html").read_text(), "<html></html>")
            self.assertEqual((staged / "assets" / "app.js").read_text(), "export {}")
            self.assertEqual(
                (staged / "mathjax-fonts" / "MathJax_Main-Regular.woff").read_bytes(),
                b"woff",
            )
            self.assertFalse((staged / "traceviewer").exists())
            self.assertFalse((staged / "var").exists())

    def test_stage_viewer_requires_index_html(self):
        build_binary = load_build_binary()
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "dist"
            source.mkdir()
            with self.assertRaises(FileNotFoundError):
                build_binary.stage_viewer(source, Path(temp_dir) / "stage")


if __name__ == "__main__":
    unittest.main()
