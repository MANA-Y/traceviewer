import sys
import unittest
from dataclasses import dataclass
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.serialization import to_serializable  # noqa: E402


@dataclass
class Example:
    value: int


class SerializationTest(unittest.TestCase):
    def test_serializes_nested_standard_values(self):
        value = {"items": [Example(3), (4, 5)]}
        self.assertEqual(to_serializable(value), {"items": [{"value": 3}, [4, 5]]})


if __name__ == "__main__":
    unittest.main()
