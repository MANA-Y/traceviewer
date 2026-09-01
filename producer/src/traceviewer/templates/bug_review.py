"""__TITLE__ presentation."""

from traceviewer import callout, code, diff, notes, section, text


BEFORE = """def load_cart(user_id):
    with LOCK:
        cached = cache.get(user_id)
        if cached is None:
            cached = hydrate(user_id)
            cache.set(user_id, cached)
        return cached
"""

AFTER = """def load_cart(user_id):
    cached = cache.get(user_id)
    if cached is not None:
        return cached
    with lock_for(user_id):
        cached = cache.get(user_id)
        if cached is None:
            cached = hydrate(user_id)
            cache.set(user_id, cached)
        return cached
"""


def main():
    text("# __TITLE__")
    notes("One incident. Symptom, one hypothesis, the counterexample, then the fix.")
    text("Name the outage in one sentence. Who felt it, and what stayed healthy.")

    section("Symptom", "What broke, and what did not")
    callout("Replace this with the user-visible failure and the green check that hid it.", tone="danger")
    notes("Pause. Ask if anyone has seen a green health check hide the real lock.")

    section("Hypothesis", "The smallest story that fits the symptom")
    code(BEFORE, "python")
    text("Point at the line that serializes everyone else. Keep the rest in source view.")

    section("Fix", "The smallest change that removes the pile-up")
    diff(BEFORE, AFTER, "python")
    callout("State the measured recovery. One number is enough.", tone="success")
    notes("Pack the audience folder before the talk. The footer credit is enough attribution.")
