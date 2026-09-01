"""__TITLE__ presentation."""

import sys

from traceviewer import callout, code, notes, section, terminal, text


CHECK = """import json
from urllib.request import urlopen

print(json.load(urlopen("http://127.0.0.1:8000/health"))["status"])
"""


def main():
    text("# __TITLE__")
    notes("Each beat is a prompt. The next beat is a recorded result. Then a pause.")
    text("A lab on one track. The room follows the same steps the presenter does.")

    section("Prompt", "What the room should try")
    text("Write a health check that prints `ok` and nothing else.")
    code(CHECK, "python")
    notes("Do not live-code past the prompt. Let people start.")

    section("Recorded result", "What success looks like")
    terminal([sys.executable, "-c", "print('ok')"])
    callout("Your turn. Run it once before we change anything.", title="Your turn", tone="info")
    notes("Wait until most laptops show ok. Then continue.")

    section("Next beat", "Change one thing, record it again")
    text("Swap the URL or the assertion. Capture the new command with `terminal()`.")
    callout("Keep mutating commands out of the talk unless the mutation is the lesson.", tone="warning")
    notes("Pack the lab before the room arrives. Offline replay does not need Python.")
