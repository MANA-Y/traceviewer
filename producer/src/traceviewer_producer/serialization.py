from dataclasses import fields, is_dataclass
from typing import Any


def _qualified_type(value: Any) -> str:
    value_type = type(value)
    return f"{value_type.__module__}.{value_type.__qualname__}"


def _primitive_key(value: Any) -> str | int | float | bool:
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def to_serializable(value: Any) -> Any:
    """Convert presentation values without importing optional GPU libraries."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [to_serializable(item) for item in value]
    if isinstance(value, dict):
        return {_primitive_key(key): to_serializable(item) for key, item in value.items()}
    if is_dataclass(value) and not isinstance(value, type):
        return {
            item.name: to_serializable(getattr(value, item.name))
            for item in fields(value)
        }

    qualified_type = _qualified_type(value)
    if qualified_type.startswith("torch.") and hasattr(value, "tolist"):
        return value.tolist()
    if qualified_type == "sympy.core.numbers.Integer":
        return int(value)
    if qualified_type == "sympy.core.numbers.Float":
        return float(value)
    if qualified_type.startswith("sympy."):
        return str(value)
    return str(value)
