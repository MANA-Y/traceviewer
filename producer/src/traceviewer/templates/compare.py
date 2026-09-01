"""__TITLE__ presentation."""

from traceviewer import callout, chart, columns, metrics, notes, section, table, text


def main():
    text("# __TITLE__")
    notes("Two measured runs. One comparison. One verdict. No third option.")
    text("Replace these numbers with the two implementations you actually timed.")

    section("The two options", "Same workload, different code path")
    columns(
        "### Interpreter\nCold start, then a steady 42 ms median.",
        "### Compiled\nLonger build, then an 11 ms median.",
    )

    section("The measurement", "One table, one chart, same samples")
    table(
        ["Build", "Median", "p95", "Samples"],
        [["Interpreter", "42 ms", "58 ms", "30"], ["Compiled", "11 ms", "14 ms", "30"]],
        caption="CLI latency on the same laptop",
    )
    chart(["Interpreter", "Compiled"], {"median": [42, 11], "p95": [58, 14]}, kind="bar")
    metrics({"Compiled median": "11 ms", "Speedup": "3.8×"})
    notes("Read the median first. Only go to p95 if someone asks about tails.")

    section("Verdict", "What the room should remember")
    callout("Ship the compiled path. The build cost is paid once per release.", tone="success")
    notes("Pack this as the audience artifact. One verdict is the last slide.")
