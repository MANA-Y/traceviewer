from execute_util import callout, code, diff, notes, section, text


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
    text("# Checkout timeouts")
    notes("Share the presenter URL. This overlay is only for you.")
    text("Friday deploy. Checkout p95 jumped from 240 ms to 4.1 s. Payments stayed healthy.")

    section("Symptom", "Only checkout, only after the cache change")
    callout("Health checks stayed green. The queue grew behind one process-wide lock.", tone="danger")
    notes("Pause. Ask if anyone has seen a green probe hide a lock.")

    section("Hypothesis", "A cache miss serialized every cart")
    code(BEFORE, "python")
    text("The lock wrapped the read and the fill. The first miss blocked everyone else.")
    notes("Keep long samples in constants so audience line numbers stay clean.")

    section("Fix", "Lock only the fill, and only per key")
    diff(BEFORE, AFTER, "python")
    callout("p95 returned to 220 ms. Step with the keys or the bottom scrubber.", tone="success")
