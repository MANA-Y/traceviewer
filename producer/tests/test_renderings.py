import json
import sys
import os
import tempfile
import unittest
from pathlib import Path


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.models import Reference  # noqa: E402
from traceviewer_producer.renderings import (  # noqa: E402
    clear_renderings,
    callout,
    chart,
    code,
    columns,
    diff,
    divider,
    graph,
    image,
    link,
    pop_renderings,
    shell,
    steps,
    metrics,
    notes,
    quote,
    section,
    table,
    terminal,
    text,
    timeline,
)


class RenderingTest(unittest.TestCase):
    def setUp(self):
        clear_renderings()

    def test_text_and_link_keep_legacy_shape(self):
        text("hello", style={"width": 400})
        link(Reference(title="Docs", url="https://example.com"))
        renderings = pop_renderings()

        self.assertEqual(renderings[0].type, "markdown")
        self.assertEqual(renderings[0].style, {"width": 400})
        self.assertEqual(renderings[1].external_link.title, "Docs")

    def test_code_keeps_language_metadata(self):
        code("void main() {}", "DART")
        rendering = pop_renderings()[0]

        self.assertEqual(rendering.type, "code")
        self.assertEqual(rendering.language, "dart")

    def test_shell_accepts_a_command_string_without_shell_expansion(self):
        shell(f"{sys.executable} -c \"print('hello')\"")
        rendering = pop_renderings()[0]

        self.assertEqual(rendering.type, "markdown")
        self.assertEqual(rendering.data, "hello")

    def test_structured_renderers_emit_json_payloads(self):
        table(["Mode", "p95"], [["profile", 12.4]], caption="Latency")
        chart(["before", "after"], {"p95": [18, 11]}, kind="bar")
        callout("Use profile mode", tone="warning", title="Measurement")
        diff("old\n", "new\n", "dart")
        renderings = pop_renderings()

        self.assertEqual([item.type for item in renderings], ["table", "chart", "callout", "diff"])
        self.assertEqual(json.loads(renderings[0].data)["caption"], "Latency")
        self.assertEqual(json.loads(renderings[1].data)["kind"], "bar")

    def test_timeline_emits_single_and_compare_payloads(self):
        timeline(
            [
                {"name": "parse", "start": 0, "duration": 6.0},
                {"name": "wait", "start": 8, "duration": 299, "kind": "wait"},
            ],
            title="Start",
        )
        timeline(
            [{
                "name": "draw",
                "spans": [
                    {"series": "UIC", "start": 70, "duration": 27.4},
                    {"series": "FW", "start": 80, "duration": 21.4},
                ],
            }],
            title="Compare",
            series=["UIC", "FW"],
            colors={"UIC": "#2a9d8f", "FW": "#c23b22"},
        )
        renderings = pop_renderings()
        single = json.loads(renderings[0].data)
        compare = json.loads(renderings[1].data)

        self.assertEqual([item.type for item in renderings], ["timeline", "timeline"])
        self.assertEqual(single["title"], "Start")
        self.assertEqual(single["compress"], "wait")
        self.assertEqual(single["lanes"][1]["kind"], "wait")
        self.assertEqual(compare["series"], ["UIC", "FW"])
        self.assertEqual(compare["lanes"][0]["spans"][0]["series"], "UIC")

    def test_timeline_rejects_invalid_lanes(self):
        with self.assertRaisesRegex(ValueError, "non-empty list"):
            timeline([])
        with self.assertRaisesRegex(ValueError, "duration must be"):
            timeline([{"name": "draw", "start": 0, "duration": -1}])
        with self.assertRaisesRegex(ValueError, "hex"):
            timeline([{"name": "draw", "start": 0, "duration": 1, "color": "red"}])

    def test_terminal_captures_exit_metadata(self):
        terminal([sys.executable, "-c", "import sys; print('ok'); print('warn', file=sys.stderr)"])
        payload = json.loads(pop_renderings()[0].data)

        self.assertEqual(payload["exitCode"], 0)
        self.assertEqual(payload["stdout"], "ok\n")
        self.assertEqual(payload["stderr"], "warn\n")

    def test_composition_renderers_emit_structured_payloads(self):
        columns("**CLI**", "**Flutter**", gap="wide")
        metrics({"median": "11 ms", "p95": "14 ms"})
        quote("Measure, don't guess.", "Performance team")
        divider("Results")
        section("Profiling", "From symptom to trace")
        renderings = pop_renderings()

        self.assertEqual(
            [item.type for item in renderings],
            ["columns", "metrics", "quote", "divider", "section"],
        )
        self.assertEqual(json.loads(renderings[0].data)["gap"], "wide")

    def test_notes_emit_presenter_only_structured_payload(self):
        notes("Explain why profile mode is required.\nPause for questions.")
        rendering = pop_renderings()[0]

        self.assertEqual(rendering.type, "notes")
        self.assertEqual(
            json.loads(rendering.data),
            {"message": "Explain why profile mode is required.\nPause for questions."},
        )

    def test_notes_reject_invalid_messages(self):
        with self.assertRaisesRegex(TypeError, "string message"):
            notes(None)  # type: ignore[arg-type]
        with self.assertRaisesRegex(ValueError, "non-empty message"):
            notes("  \n")

    def test_image_resolves_from_the_static_public_directory(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            previous_directory = Path.cwd()
            os.chdir(temporary_directory)
            try:
                image_path = Path("public/var/example.png")
                image_path.parent.mkdir(parents=True)
                image_path.write_bytes(b"png")
                image("var/example.png", alt="Example")
                rendering = pop_renderings()[0]
            finally:
                os.chdir(previous_directory)

        self.assertEqual(rendering.data, "/var/example.png")
        self.assertEqual(rendering.alt, "Example")

    def test_graph_emits_nodes_edges_and_cycle_kind(self):
        graph(
            [
                {"id": "net", "label": "сеть", "kind": "wait", "lane": 0, "column": 0},
                {"id": "draw", "label": "draw", "kind": "ui", "lane": 1, "column": 1},
            ],
            [
                ("net", "draw"),
                {"from": "draw", "to": "net", "kind": "cycle", "label": "полинг"},
            ],
            title="Этапы",
            lanes=["сеть", "UI"],
        )
        payload = json.loads(pop_renderings()[0].data)
        self.assertEqual(payload["title"], "Этапы")
        self.assertEqual(payload["lanes"], ["сеть", "UI"])
        self.assertEqual(payload["nodes"][0]["kind"], "wait")
        self.assertEqual(payload["edges"][1]["kind"], "cycle")
        self.assertEqual(payload["edges"][1]["label"], "полинг")

    def test_graph_rejects_unknown_edge_nodes(self):
        with self.assertRaisesRegex(ValueError, "unknown node"):
            graph(["a"], [("a", "missing")])
        with self.assertRaisesRegex(ValueError, "non-empty list"):
            graph([], [])

    def test_steps_emits_structured_payloads(self):
        steps([("Context", "Goals and metrics"), ("Methods", "Devices and traces")])
        steps([{"title": "Where time goes", "description": "Widget build vs payload"}], layout="grid")
        steps(["Step 1", "Step 2"])
        renderings = pop_renderings()

        self.assertEqual([item.type for item in renderings], ["steps", "steps", "steps"])
        payload_1 = json.loads(renderings[0].data)
        self.assertEqual(payload_1["layout"], "list")
        self.assertEqual(len(payload_1["items"]), 2)
        self.assertEqual(payload_1["items"][0], {"index": 1, "title": "Context", "description": "Goals and metrics"})

        payload_2 = json.loads(renderings[1].data)
        self.assertEqual(payload_2["layout"], "grid")
        self.assertEqual(payload_2["items"][0]["title"], "Where time goes")

        payload_3 = json.loads(renderings[2].data)
        self.assertEqual(payload_3["items"][0], {"index": 1, "title": "Step 1", "description": ""})

    def test_image_keeps_focus_and_overlay_metadata(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "example.png"
            image_path.write_bytes(b"png")
            image(
                str(image_path),
                focus={"x": 10, "y": 20, "width": 40, "height": 30},
                overlays=[{
                    "x": 25,
                    "y": 35,
                    "title": "Latency spike",
                    "text": "This peak is the important part.",
                    "focus": {"x": 15, "y": 25, "width": 20, "height": 20},
                }],
            )
        rendering = pop_renderings()[0]

        self.assertEqual(rendering.focus, {"x": 10.0, "y": 20.0, "width": 40.0, "height": 30.0})
        self.assertEqual(rendering.overlays[0]["title"], "Latency spike")
        self.assertEqual(rendering.overlays[0]["focus"]["width"], 20.0)

    def test_image_rejects_out_of_bounds_focus(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            image_path = Path(temporary_directory) / "example.png"
            image_path.write_bytes(b"png")
            with self.assertRaisesRegex(ValueError, "0–100 image area"):
                image(str(image_path), focus={"x": 80, "y": 0, "width": 30, "height": 20})


if __name__ == "__main__":
    unittest.main()
