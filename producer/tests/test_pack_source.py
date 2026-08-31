import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPOSITORY_ROOT / "scripts" / "pack_source.py"


def load_pack_source():
    spec = importlib.util.spec_from_file_location("pack_source", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_minimal_tree(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / "docs").mkdir()
    (root / "producer").mkdir()
    (root / "scripts").mkdir()
    (root / "README.md").write_text("TraceViewer\n")
    (root / "LICENSE").write_text("MIT License\n")
    (root / "package.json").write_text("{}\n")
    (root / "package-lock.json").write_text("{}\n")
    (root / "producer" / "pyproject.toml").write_text("[project]\nname = 'x'\n")
    (root / "docs" / "BUILD.md").write_text("build\n")
    (root / "docs" / "AUTHORING.md").write_text("author\n")
    (root / "scripts" / "bootstrap.sh").write_text("#!/bin/sh\n")
    (root / "scripts" / "build_binary.py").write_text("print(0)\n")
    (root / "presentations").mkdir()
    (root / "presentations" / "example.py").write_text("def main():\n    pass\n")


class PackSourceTest(unittest.TestCase):
    def test_walker_skips_install_and_build_outputs(self):
        pack_source = load_pack_source()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_minimal_tree(root)
            (root / "node_modules" / "left-pad").mkdir(parents=True)
            (root / "node_modules" / "left-pad" / "index.js").write_text("module.exports = 1\n")
            (root / "dist").mkdir()
            (root / "dist" / "traceviewer").write_bytes(b"elf")
            (root / ".venv" / "bin").mkdir(parents=True)
            (root / ".venv" / "bin" / "python").write_bytes(b"elf")
            (root / "src").mkdir()
            (root / "src" / "App.jsx").write_text("export default function App() {}\n")
            (root / ".claude").mkdir()
            (root / ".claude" / "launch.json").write_text("{}\n")

            names = [
                path.relative_to(root).as_posix()
                for path in pack_source.list_source_files(root)
            ]
            self.assertIn("README.md", names)
            self.assertIn("docs/BUILD.md", names)
            self.assertIn("docs/AUTHORING.md", names)
            self.assertIn("src/App.jsx", names)
            self.assertNotIn("node_modules/left-pad/index.js", names)
            self.assertNotIn("dist/traceviewer", names)
            self.assertNotIn(".venv/bin/python", names)
            self.assertNotIn(".claude/launch.json", names)

    def test_pack_source_writes_zip_with_manifest(self):
        pack_source = load_pack_source()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "repo"
            write_minimal_tree(root)
            (root / "node_modules").mkdir()
            (root / "node_modules" / "skip.js").write_text("no\n")
            destination = Path(temp_dir) / "traceviewer-source.zip"

            packed = pack_source.pack_source(root, destination)
            self.assertEqual(packed, destination.resolve())
            with zipfile.ZipFile(packed) as archive:
                names = set(archive.namelist())
                manifest = json.loads(archive.read("traceviewer/traceviewer-source.json"))
            self.assertIn("traceviewer/README.md", names)
            self.assertIn("traceviewer/docs/BUILD.md", names)
            self.assertIn("traceviewer/docs/AUTHORING.md", names)
            self.assertIn("traceviewer/scripts/bootstrap.sh", names)
            self.assertNotIn("traceviewer/node_modules/skip.js", names)
            self.assertEqual(manifest["kind"], "source")
            self.assertGreaterEqual(manifest["fileCount"], 8)

    def test_git_listing_ignores_untracked_build_trees(self):
        pack_source = load_pack_source()
        git = subprocess.run(["git", "--version"], capture_output=True)
        if git.returncode != 0:
            self.skipTest("git is not available")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            write_minimal_tree(root)
            (root / ".gitignore").write_text("node_modules/\ndist/\n")
            (root / "node_modules").mkdir()
            (root / "node_modules" / "skip.js").write_text("no\n")
            (root / "tracked.js").write_text("yes\n")
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "add", "README.md", "package.json", "tracked.js"], cwd=root, check=True)
            names = [
                path.relative_to(root).as_posix()
                for path in pack_source.list_source_files(root)
            ]
            self.assertIn("tracked.js", names)
            self.assertIn("docs/AUTHORING.md", names)
            self.assertNotIn("node_modules/skip.js", names)

    def test_repository_contains_required_source_kit_files(self):
        pack_source = load_pack_source()
        pack_source.verify_required_files(REPOSITORY_ROOT)
        names = {
            path.relative_to(REPOSITORY_ROOT).as_posix()
            for path in pack_source.list_source_files(REPOSITORY_ROOT)
        }
        for required in pack_source.REQUIRED_FILES:
            self.assertIn(required, names)


if __name__ == "__main__":
    unittest.main()
