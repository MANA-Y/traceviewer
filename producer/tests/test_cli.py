import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.cli import build_parser, main  # noqa: E402
from traceviewer_producer.development import run_development  # noqa: E402
from traceviewer_producer.live import development_origins  # noqa: E402
from traceviewer_producer.scaffold import (  # noqa: E402
    create_presentation,
    create_talk_project,
    module_name_for_directory,
    validate_module_slug,
    validate_project_name,
)
from traceviewer_producer.targets import resolve_presentation_target  # noqa: E402


class ScaffoldTest(unittest.TestCase):
    def test_validate_module_slug_accepts_python_modules(self):
        for slug in ("demo", "flutter_101", "a2"):
            with self.subTest(slug=slug):
                self.assertEqual(validate_module_slug(slug), slug)

    def test_validate_module_slug_rejects_unsafe_names(self):
        for slug in ("", "Demo", "2demo", "demo-name", "../demo", "a/b"):
            with self.subTest(slug=slug):
                with self.assertRaises(ValueError):
                    validate_module_slug(slug)

    def test_create_presentation_writes_readable_starter(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = create_presentation(
                "flutter_perf", directory=Path(temp_dir) / "presentations"
            )
            source = destination.read_text(encoding="utf-8")
            self.assertEqual(destination.name, "flutter_perf.py")
            self.assertIn("from traceviewer import", source)
            self.assertIn("def main():", source)
            self.assertIn('text("# Flutter Perf")', source)
            compile(source, str(destination), "exec")

    def test_create_presentation_refuses_overwrite_without_force(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            directory = Path(temp_dir) / "presentations"
            destination = create_presentation("demo", directory=directory)
            destination.write_text("keep me", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                create_presentation("demo", directory=directory)
            self.assertEqual(destination.read_text(encoding="utf-8"), "keep me")

            create_presentation("demo", directory=directory, force=True)
            self.assertIn("def main():", destination.read_text(encoding="utf-8"))

    def test_new_command_prints_next_steps(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            output = io.StringIO()
            previous = Path.cwd()
            try:
                os.chdir(workspace)
                with contextlib.redirect_stdout(output):
                    result = main(["new", "demo"])
            finally:
                os.chdir(previous)
            self.assertEqual(result, 0)
            self.assertTrue((workspace / "demo" / "talk.py").is_file())
            self.assertTrue((workspace / "demo" / "assets").is_dir())
            self.assertIn("Created demo/talk.py", output.getvalue())
            self.assertIn("cd demo", output.getvalue())
            self.assertIn("traceviewer dev talk.py", output.getvalue())
            self.assertIn("traceviewer build talk.py", output.getvalue())
            self.assertNotIn("Template:", output.getvalue())

    def test_new_command_reports_selected_template(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            output = io.StringIO()
            previous = Path.cwd()
            try:
                os.chdir(workspace)
                with contextlib.redirect_stdout(output):
                    result = main(["new", "outage", "--template", "bug-review"])
            finally:
                os.chdir(previous)
            self.assertEqual(result, 0)
            source = (workspace / "outage" / "talk.py").read_text(encoding="utf-8")
            self.assertIn("Template: bug-review", output.getvalue())
            self.assertIn("from traceviewer import", source)
            self.assertIn("diff(", source)

    def test_create_talk_project_accepts_hyphenated_names(self):
        self.assertEqual(validate_project_name("my-talk"), "my-talk")
        with self.assertRaises(ValueError):
            validate_project_name("My Talk")
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = create_talk_project("my-talk", parent=Path(temp_dir))
            source = destination.read_text(encoding="utf-8")
            self.assertEqual(destination, Path(temp_dir) / "my-talk" / "talk.py")
            self.assertIn('text("# My Talk")', source)
            self.assertIn("from traceviewer import", source)

    def test_generated_talk_executes_through_file_path(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            create_talk_project("demo", parent=workspace)
            previous = Path.cwd()
            try:
                os.chdir(workspace / "demo")
                from traceviewer_producer.capture import execute

                trace = execute(resolve_presentation_target("talk.py"))
            finally:
                os.chdir(previous)
            self.assertGreater(len(trace.steps), 0)
            self.assertIn("from traceviewer import", next(iter(trace.files.values())))

    def test_module_name_requires_an_importable_workspace_directory(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir)
            self.assertEqual(
                module_name_for_directory(workspace / "talks" / "flutter", "demo", workspace),
                "talks.flutter.demo",
            )
            with self.assertRaises(ValueError):
                module_name_for_directory(workspace / "talks-live", "demo", workspace)
            with self.assertRaises(ValueError):
                module_name_for_directory(workspace.parent / "outside", "demo", workspace)

    def test_legacy_module_arguments_still_parse(self):
        args = build_parser().parse_args(["-m", "presentations.demo", "--live"])
        self.assertIsNone(args.command)
        self.assertEqual(args.module, ["presentations.demo"])
        self.assertTrue(args.live)

    def test_canonical_build_and_live_commands_parse(self):
        build = build_parser().parse_args(["build", "presentations.demo", "-o", "out"])
        self.assertEqual(build.command, "build")
        self.assertEqual(build.module, ["presentations.demo"])
        self.assertEqual(build.output_path, "out")

        live = build_parser().parse_args([
            "live", "presentations.demo", "--open", "--viewer-url", "http://127.0.0.1:5173/",
        ])
        self.assertEqual(live.command, "live")
        self.assertEqual(live.module, "presentations.demo")
        self.assertTrue(live.open_browser)
        self.assertEqual(live.viewer_url, "http://127.0.0.1:5173/")

        dev = build_parser().parse_args([
            "dev", "presentations.demo", "--viewer-port", "0", "--no-open",
        ])
        self.assertEqual(dev.command, "dev")
        self.assertEqual(dev.viewer_port, 0)
        self.assertFalse(dev.open_browser)

    def test_live_command_passes_browser_options(self):
        run_live = AsyncMock()
        with patch("traceviewer_producer.live.run_live", run_live):
            result = main([
                "live", "presentations.demo", "--open", "--viewer-url", "http://127.0.0.1:5173/",
            ])
        self.assertEqual(result, 0)
        run_live.assert_awaited_once_with(
            "presentations.demo",
            host="127.0.0.1",
            port=8765,
            origins=None,
            inspect_all_variables=False,
            open_browser=True,
            viewer_url="http://127.0.0.1:5173/",
            allow_remote=False,
            public_url=None,
        )

    def test_remote_live_and_serve_commands_parse(self):
        live = build_parser().parse_args([
            "live", "presentations.demo", "--host", "0.0.0.0", "--allow-remote",
            "--public-url", "https://socket.example/live",
        ])
        self.assertTrue(live.allow_remote)
        self.assertEqual(live.public_url, "https://socket.example/live")

        serve = build_parser().parse_args(["serve", "--port", "9000", "--dist-path", "dist"])
        self.assertEqual(serve.command, "serve")
        self.assertEqual(serve.port, 9000)
        self.assertEqual(serve.dist_path, Path("dist"))

        pack = build_parser().parse_args([
            "pack", "talk.json", "-o", "bundle", "--asset-root", "assets",
        ])
        self.assertEqual(pack.command, "pack")
        self.assertEqual(pack.output, Path("bundle"))
        self.assertEqual(pack.asset_root, Path("assets"))

    def test_pack_command_reports_created_package(self):
        fixture = PRODUCER_ROOT.parent / "fixtures/contracts/trace-v2.minimal.json"
        output_text = io.StringIO()
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            viewer = root / "viewer"
            viewer.mkdir()
            (viewer / "index.html").write_text("<html><head></head><body></body></html>")
            destination = root / "package"
            with contextlib.redirect_stdout(output_text):
                result = main([
                    "pack", str(fixture), "-o", str(destination),
                    "--dist-path", str(viewer), "--asset-root", str(root),
                ])
            self.assertTrue((destination / "trace.json").is_file())
        self.assertEqual(result, 0)
        self.assertIn("Packed 1 steps and 0 assets", output_text.getvalue())

    def test_validate_command_accepts_shared_contract_fixture(self):
        fixture = PRODUCER_ROOT.parent / "fixtures/contracts/trace-v2.minimal.json"
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = main(["validate", str(fixture)])
        self.assertEqual(result, 0)
        self.assertIn("OK", output.getvalue())
        self.assertIn("1 steps, 1 files", output.getvalue())

    def test_validate_command_reports_contract_errors(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "broken.json"
            path.write_text('{"formatVersion": 99, "files": {}, "steps": []}')
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                result = main(["validate", str(path)])
        self.assertEqual(result, 1)
        self.assertIn("FAIL", output.getvalue())
        self.assertIn("formatVersion", output.getvalue())

    def test_doctor_command_uses_check_status_for_exit_code(self):
        checks = [Mock(status="pass"), Mock(status="fail")]
        with patch("traceviewer_producer.doctor.collect_checks", return_value=checks), patch(
            "traceviewer_producer.doctor.print_checks"
        ) as print_checks:
            result = main(["doctor"])
        self.assertEqual(result, 1)
        print_checks.assert_called_once_with(checks)

    def test_dev_command_passes_local_service_options(self):
        with patch("traceviewer_producer.development.run_development") as run_development:
            result = main([
                "dev", "presentations/demo.py", "--viewer-port", "4180",
                "--live-port", "8770", "--no-open",
            ])
        self.assertEqual(result, 0)
        run_development.assert_called_once_with(
            "presentations.demo",
            viewer_host="127.0.0.1",
            viewer_port=4180,
            live_host="127.0.0.1",
            live_port=8770,
            dist_path=None,
            inspect_all_variables=False,
            open_browser=False,
        )

    def test_development_session_stops_local_viewer_after_live_mode(self):
        server = Mock(server_address=("127.0.0.1", 4312))
        with patch(
            "traceviewer_producer.development.create_viewer_server", return_value=server
        ), patch(
            "traceviewer_producer.development.run_live"
        ) as run_live, patch(
            "traceviewer_producer.development.asyncio.run"
        ) as asyncio_run:
            run_development("presentations.demo", viewer_port=0, open_browser=False)
        run_live.assert_called_once_with(
            "presentations.demo",
            host="127.0.0.1",
            port=8765,
            origins=development_origins("http://127.0.0.1:4312/"),
            inspect_all_variables=False,
            open_browser=False,
            viewer_url="http://127.0.0.1:4312/",
        )
        asyncio_run.assert_called_once()
        asyncio_run.call_args.args[0].close()
        server.shutdown.assert_called_once_with()
        server.server_close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
