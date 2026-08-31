from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4


TRACE_EVENT_PROTOCOL_VERSION = 1


@dataclass
class EventFactory:
    session_id: str = field(default_factory=lambda: uuid4().hex)
    sequence: int = 0
    revision: int = 0

    def start_revision(self) -> int:
        self.revision += 1
        return self.revision

    def make(self, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        event = {
            "protocolVersion": TRACE_EVENT_PROTOCOL_VERSION,
            "type": event_type,
            "sessionId": self.session_id,
            "sequence": self.sequence,
            "revision": self.revision,
            "payload": payload,
        }
        self.sequence += 1
        return event
