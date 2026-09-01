import argparse
import asyncio
import json
import sys
from pathlib import Path

from traceviewer.templates import DEFAULT_TEMPLATE, TEMPLATES, known_templates

from .capture import execute
from .contract import to_document
from .scaffold import create_talk_project
from .targets import default_asset_root, default_build_output, extra_asset_roots, resolve_presentation_target
from .validation import load_document, validate_document


def _presentation_module(target: str) -> str:
    return resolve_presentation_target(target)


def _asset_root(value: Path | None) -> Path:
    return Path(value) if value is not None else default_asset_root()


def _output_path(value: str | Path | None) -> Path:
    return Path(value) if value is not None else default_build_output()


def _add_build_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("module", nargs="+", help="Python module or talk.py path")
    parser.add_argument(
        "-o",
        "--output-path",
        default=None,
        help="Directory for generated JSON traces (default: public/var/traces or the current directory)",
    )
    parser.add_argument(
        "-I",
        "--inspect-all-variables",
        action="store_true",
        help="Capture all local variables instead of only @inspect annotations",
    )
    parser.add_argument(
        "--include-notes",
        action="store_true",
        help="Include private presenter notes in the generated snapshot",
    )


def _add_live_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("module", help="Python module or talk.py path")
    parser.add_argument("--host", default="127.0.0.1", help="Live server loopback host")
    parser.add_argument("--port", default=8765, type=int, help="Live server port")
    parser.add_argument("--origin", action="append", help="Allowed viewer origin; may be repeated")
    parser.add_argument("--open", dest="open_browser", action="store_true", help="Open the live viewer after the server is ready")
    parser.add_argument("--viewer-url", default="http://localhost:5173/", help="Base URL of the TraceViewer web application")
    parser.add_argument("--allow-remote", action="store_true", help="Allow an explicit non-loopback bind")
    parser.add_argument("--public-url", help="Externally reachable HTTP(S) or WebSocket tunnel URL")
    parser.add_argument(
        "-I",
        "--inspect-all-variables",
        action="store_true",
        help="Capture all local variables instead of only @inspect annotations",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Code-first slides for technical talks")
    commands = parser.add_subparsers(dest="command")
    new_parser = commands.add_parser("new", help="Create a standalone talk directory")
    new_parser.add_argument("name", help="Lowercase directory name (hyphens allowed)")
    new_parser.add_argument(
        "--directory",
        default=Path("."),
        type=Path,
        help="Parent directory for the new talk project (default: current directory)",
    )
    new_parser.add_argument("--force", action="store_true", help="Replace an existing talk.py")
    new_parser.add_argument(
        "--template",
        choices=known_templates(),
        default=DEFAULT_TEMPLATE,
        help="Talk shape (default: starter). "
        + "; ".join(f"{name}: {TEMPLATES[name].rstrip('.')}" for name in known_templates()),
    )

    build_command = commands.add_parser("build", help="Generate static presentation snapshots")
    _add_build_arguments(build_command)
    live_command = commands.add_parser("live", help="Watch a presentation and stream revisions")
    _add_live_arguments(live_command)
    dev_command = commands.add_parser("dev", help="Run the viewer and live authoring loop")
    dev_command.add_argument("module", help="Python module or talk.py path")
    dev_command.add_argument("--viewer-host", default="127.0.0.1", help="Static viewer host")
    dev_command.add_argument("--viewer-port", default=4173, type=int, help="Static viewer port")
    dev_command.add_argument("--live-host", default="127.0.0.1", help="Live server host")
    dev_command.add_argument("--live-port", default=8765, type=int, help="Live server port")
    dev_command.add_argument("--dist-path", type=Path, help="Explicit viewer dist directory")
    dev_command.add_argument("--no-open", dest="open_browser", action="store_false", help="Do not open the presenter URL")
    dev_command.add_argument(
        "-I", "--inspect-all-variables", action="store_true",
        help="Capture all local variables instead of only @inspect annotations",
    )
    validate_command = commands.add_parser("validate", help="Validate modules or JSON traces")
    validate_command.add_argument("target", nargs="+", help="Python module, talk.py path, or trace JSON")
    validate_command.add_argument(
        "--asset-root", type=Path, default=None,
        help="Root used to resolve local image assets (default: public/ or the current directory)",
    )
    validate_command.add_argument(
        "-I", "--inspect-all-variables", action="store_true",
        help="Capture all local variables instead of only @inspect annotations",
    )
    doctor_command = commands.add_parser("doctor", help="Check the local authoring environment")
    doctor_command.add_argument("--dist-path", type=Path, help="Explicit viewer dist directory")
    pack_command = commands.add_parser("pack", help="Create a portable static presentation folder")
    pack_command.add_argument("target", help="Python module, talk.py path, or trace JSON")
    pack_command.add_argument("-o", "--output", type=Path, default=Path("dist/traceviewer-package"))
    pack_command.add_argument("--dist-path", type=Path, help="Explicit viewer dist directory")
    pack_command.add_argument("--asset-root", type=Path, default=None)
    pack_command.add_argument("--include-notes", action="store_true")
    pack_command.add_argument("-I", "--inspect-all-variables", action="store_true")
    pack_command.add_argument("--force", action="store_true")
    serve_command = commands.add_parser("serve", help="Serve the built TraceViewer web application")
    serve_command.add_argument("--host", default="127.0.0.1", help="Static viewer host")
    serve_command.add_argument("--port", default=4173, type=int, help="Static viewer port")
    serve_command.add_argument("--dist-path", type=Path, help="Explicit viewer dist directory")

    # Keep the original flag-based interface for existing scripts.
    parser.add_argument("-m", "--module", nargs="+", help="Python module(s) to execute")
    parser.add_argument(
        "-o",
        "--output-path",
        default=None,
        help="Directory for generated JSON traces",
    )
    parser.add_argument("--live", action="store_true", help="Watch one module and stream revisions")
    parser.add_argument("--host", default="127.0.0.1", help="Live server loopback host")
    parser.add_argument("--port", default=8765, type=int, help="Live server port")
    parser.add_argument(
        "--origin",
        action="append",
        help="Allowed viewer origin; may be repeated",
    )
    parser.add_argument("--open", dest="open_browser", action="store_true", help="Open the live viewer after the server is ready")
    parser.add_argument("--viewer-url", default="http://localhost:5173/", help="Base URL of the TraceViewer web application")
    parser.add_argument("--allow-remote", action="store_true", help="Allow an explicit non-loopback bind")
    parser.add_argument("--public-url", help="Externally reachable HTTP(S) or WebSocket tunnel URL")
    parser.add_argument(
        "-I",
        "--inspect-all-variables",
        action="store_true",
        help="Capture all local variables instead of only @inspect annotations",
    )
    parser.add_argument(
        "--include-notes",
        action="store_true",
        help="Include private presenter notes in generated static snapshots",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    workspace = str(Path.cwd().resolve())
    if workspace not in sys.path:
        sys.path.insert(0, workspace)
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "new":
        try:
            destination = create_talk_project(
                args.name,
                parent=args.directory,
                force=args.force,
                template=args.template,
            )
        except (ValueError, FileExistsError) as error:
            parser.error(str(error))
        try:
            created = destination.resolve().relative_to(Path.cwd())
        except ValueError:
            created = destination
        print(f"Created {created.as_posix()}")
        if args.template != DEFAULT_TEMPLATE:
            print(f"Template: {args.template} — {TEMPLATES[args.template]}")
        print("\nStart editing with live reload:")
        print(f"  cd {created.parent.as_posix()}")
        print("  traceviewer dev talk.py")
        print("\nCreate a static snapshot:")
        print("  traceviewer build talk.py")
        return 0
    if args.command == "serve":
        from .static_server import serve_viewer

        try:
            serve_viewer(
                args.host,
                args.port,
                args.dist_path,
                extra_roots=extra_asset_roots(Path.cwd(), default_asset_root()),
            )
        except KeyboardInterrupt:
            print("TraceViewer server stopped")
        return 0
    if args.command == "doctor":
        from .doctor import collect_checks, print_checks

        checks = collect_checks(args.dist_path)
        print_checks(checks)
        return 1 if any(check.status == "fail" for check in checks) else 0
    if args.command == "validate":
        from .packaging import validate_assets

        asset_root = _asset_root(args.asset_root)
        has_errors = False
        for target in args.target:
            try:
                if target.lower().endswith(".json"):
                    document = load_document(target)
                else:
                    module_name = _presentation_module(target)
                    trace = execute(module_name, inspect_all_variables=args.inspect_all_variables)
                    document = to_document(trace, include_presenter_notes=True)
                errors = [*validate_document(document), *validate_assets(document, asset_root)]
            except Exception as error:
                errors = [str(error)]
            if errors:
                has_errors = True
                print(f"FAIL {target}")
                for error in errors:
                    print(f"  - {error}")
            else:
                print(f"OK {target}: {len(document['steps'])} steps, {len(document['files'])} files")
        return 1 if has_errors else 0
    if args.command == "pack":
        from .packaging import pack_document

        try:
            if args.target.lower().endswith(".json"):
                document = load_document(args.target)
            else:
                module_name = _presentation_module(args.target)
                trace = execute(module_name, inspect_all_variables=args.inspect_all_variables)
                document = to_document(trace, include_presenter_notes=args.include_notes)
            result = pack_document(
                document,
                args.output,
                viewer_dist=args.dist_path,
                asset_root=_asset_root(args.asset_root),
                force=args.force,
            )
        except (ValueError, FileExistsError, OSError) as error:
            print(f"FAIL {args.target}\n  {error}")
            return 1
        print(f"Packed {len(document['steps'])} steps and {result.assets} assets to {result.destination}")
        print(f"Open {result.destination / 'index.html'} offline, or serve with:")
        print(f"  traceviewer serve --dist-path {result.destination}")
        return 0
    if args.command == "dev":
        from .development import run_development

        try:
            run_development(
                _presentation_module(args.module),
                viewer_host=args.viewer_host,
                viewer_port=args.viewer_port,
                live_host=args.live_host,
                live_port=args.live_port,
                dist_path=args.dist_path,
                inspect_all_variables=args.inspect_all_variables,
                open_browser=args.open_browser,
            )
        except KeyboardInterrupt:
            print("Development session stopped")
        return 0
    if args.command == "live":
        modules = [args.module]
        live_mode = True
    elif args.command == "build":
        modules = args.module
        live_mode = False
    else:
        modules = args.module
        live_mode = args.live
    if not modules:
        parser.error("the following arguments are required: -m/--module (or use 'new')")
    if getattr(args, "open_browser", False) and not live_mode:
        parser.error("--open is only valid in live mode")
    if live_mode:
        if len(modules) != 1:
            raise SystemExit("--live requires exactly one module")
        from .live import run_live

        try:
            asyncio.run(run_live(
                _presentation_module(modules[0]),
                host=args.host,
                port=args.port,
                origins=set(args.origin) if args.origin else None,
                inspect_all_variables=args.inspect_all_variables,
                open_browser=args.open_browser,
                viewer_url=args.viewer_url,
                allow_remote=args.allow_remote,
                public_url=args.public_url,
            ))
        except KeyboardInterrupt:
            print("Live producer stopped")
        return 0
    output_path = _output_path(args.output_path)
    output_path.mkdir(parents=True, exist_ok=True)
    for raw_module in modules:
        module_name = _presentation_module(raw_module)
        trace = execute(module_name, inspect_all_variables=args.inspect_all_variables)
        destination = output_path / f"{module_name}.json"
        # Traces are machine-generated and can reach millions of steps, so they
        # are written compactly; `traceviewer validate` reports structure.
        destination.write_text(json.dumps(to_document(
            trace,
            include_presenter_notes=args.include_notes,
        ), separators=(",", ":")))
        print(f"Wrote {len(trace.steps)} steps to {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
