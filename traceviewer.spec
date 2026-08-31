# PyInstaller specification for a local, self-contained TraceViewer CLI.

from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


root = Path(SPECPATH).resolve()
entrypoint = root / "producer" / "src" / "traceviewer_producer" / "__main__.py"
viewer_dist = root / "build" / "viewer-bundle"

analysis = Analysis(
    [str(entrypoint)],
    pathex=[str(root / "producer" / "src")],
    binaries=[],
    datas=[(str(viewer_dist), "traceviewer_viewer")],
    hiddenimports=[
        *collect_submodules("traceviewer_producer"),
        *collect_submodules("websockets"),
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="traceviewer",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
)
