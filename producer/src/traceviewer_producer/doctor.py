"""Local environment checks for the TraceViewer authoring workflow."""

from __future__ import annotations

import importlib.util
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from .static_server import ViewerAssetsNotFound, find_viewer_dist


@dataclass(frozen=True)
class DoctorCheck:
    status: str
    name: str
    message: str


def collect_checks(dist_path: str | Path | None = None) -> list[DoctorCheck]:
    checks = []
    version = ".".join(map(str, sys.version_info[:3]))
    checks.append(DoctorCheck(
        "pass" if sys.version_info >= (3, 11) else "fail",
        "Python",
        f"{version} (3.11 or newer required)",
    ))

    if importlib.util.find_spec("websockets") is None:
        checks.append(DoctorCheck(
            "fail",
            "Live transport",
            "missing; install with: python -m pip install 'traceviewer[live]'",
        ))
    else:
        checks.append(DoctorCheck("pass", "Live transport", "websockets is installed"))

    try:
        viewer = find_viewer_dist(dist_path)
    except ViewerAssetsNotFound as error:
        checks.append(DoctorCheck("fail", "Viewer", str(error)))
    else:
        checks.append(DoctorCheck("pass", "Viewer", str(viewer)))

    npm = shutil.which("npm")
    checks.append(DoctorCheck(
        "pass" if npm else "warn",
        "npm",
        npm or "not found; only needed when rebuilding the web viewer",
    ))

    workspace = Path.cwd()
    checks.append(DoctorCheck(
        "pass" if workspace.is_dir() else "fail",
        "Workspace",
        str(workspace.resolve()),
    ))
    return checks


def print_checks(checks: list[DoctorCheck]) -> None:
    symbols = {"pass": "OK", "warn": "WARN", "fail": "FAIL"}
    for check in checks:
        print(f"[{symbols[check.status]}] {check.name}: {check.message}")
    failures = sum(check.status == "fail" for check in checks)
    warnings = sum(check.status == "warn" for check in checks)
    print(f"\n{len(checks) - failures - warnings} passed, {warnings} warnings, {failures} failed")
