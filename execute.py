"""Compatibility entrypoint for presentations using the original producer."""

import sys
from pathlib import Path


PRODUCER_SRC = Path(__file__).parent / "producer" / "src"
sys.path.insert(0, str(PRODUCER_SRC))

from traceviewer_producer.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
