import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


PRODUCER_ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(PRODUCER_ROOT / "src"))

from traceviewer_producer.live import (  # noqa: E402
    authorize_request,
    authorize_role_request,
    development_origins,
    event_for_role,
    expand_allowed_origins,
    local_modules,
    origin_aliases,
    presentation_step_from_message,
    run_live,
    viewer_live_url,
    viewer_origin,
    websocket_url,
)
from traceviewer_producer.protocol import EventFactory  # noqa: E402


class LiveProtocolTest(unittest.TestCase):
    def test_events_have_monotonic_sequences_and_revisions(self):
        factory = EventFactory(session_id="test")
        factory.start_revision()
        first = factory.make("hello", {})
        second = factory.make("complete", {})

        self.assertEqual(first["protocolVersion"], 1)
        self.assertEqual((first["sequence"], second["sequence"]), (0, 1))
        self.assertEqual(second["revision"], 1)

    def test_authorization_requires_token_and_allowed_origin(self):
        origins = {"http://localhost:5173"}
        self.assertIsNone(authorize_request("/?token=secret", "http://localhost:5173", "secret", origins))
        self.assertEqual(authorize_request("/?token=wrong", "http://localhost:5173", "secret", origins), 401)
        self.assertEqual(authorize_request("/?token=secret", "https://evil.example", "secret", origins), 403)

    def test_role_is_derived_from_token_not_query_role(self):
        tokens = {"audience": "audience-secret", "presenter": "presenter-secret"}
        origins = {"http://localhost:5173"}

        self.assertEqual(
            authorize_role_request(
                "/?token=audience-secret&role=presenter",
                "http://localhost:5173",
                tokens,
                origins,
            ),
            ("audience", None),
        )
        self.assertEqual(
            authorize_role_request("/?token=bad", "http://localhost:5173", tokens, origins),
            (None, 401),
        )
        self.assertEqual(
            authorize_role_request("/?token=presenter-secret", "https://evil.example", tokens, origins),
            (None, 403),
        )

    def test_loopback_origin_aliases_include_localhost_and_vite(self):
        self.assertIn("http://localhost:4173", origin_aliases("http://127.0.0.1:4173"))
        allowed = expand_allowed_origins({"http://127.0.0.1:4173"})
        self.assertIsNone(
            authorize_request("/?token=secret", "http://localhost:4173", "secret", allowed)
        )
        self.assertIn("http://127.0.0.1:5173", development_origins("http://127.0.0.1:4173/"))
        self.assertNotIn("https://evil.example", development_origins("http://127.0.0.1:4173/"))

    def test_audience_reset_never_contains_notes(self):
        # Version 2 steps only hold indexes, so the rendering table sent with
        # execution_reset is the single place presenter content can leak.
        event = {
            "type": "execution_reset",
            "sequence": 4,
            "payload": {
                "formatVersion": 2,
                "files": {"talk.py": 'notes("Private")\n'},
                "audienceFiles": {"talk.py": "                \n"},
                "frames": [{
                    "path": "talk.py",
                    "line_number": 1,
                    "function_name": "main",
                    "code": 'notes("Private")',
                }],
                "audienceFrames": [{
                    "path": "talk.py",
                    "line_number": 1,
                    "function_name": "main",
                    "code": "                ",
                }],
                "outputs": [""],
                "presentationSteps": [0, 4],
                "renderings": [[
                    {"type": "markdown", "data": "Visible"},
                    {"type": "notes", "data": "Private"},
                ]],
                "audienceRenderings": [[{"type": "markdown", "data": "Visible"}]],
            },
        }

        audience = event_for_role(event, "audience")
        presenter = event_for_role(event, "presenter")

        self.assertEqual(audience["payload"]["renderings"], [
            [{"type": "markdown", "data": "Visible"}]
        ])
        self.assertEqual(presenter["payload"]["renderings"][0][1]["type"], "notes")
        self.assertNotIn("Private", audience["payload"]["frames"][0]["code"])
        self.assertIn("Private", presenter["payload"]["frames"][0]["code"])
        self.assertEqual(audience["payload"]["presentationSteps"], [0, 4])
        self.assertEqual(presenter["payload"]["presentationSteps"], [0, 4])
        self.assertNotIn("audienceRenderings", presenter["payload"])
        self.assertNotIn("audienceFrames", presenter["payload"])

    def test_hello_audience_url_is_presenter_only(self):
        event = {
            "type": "hello",
            "payload": {
                "module": "presentations.demo",
                "audienceUrl": "http://localhost:5173/?role=audience",
                "notesUrl": "http://localhost:5173/?role=presenter&view=notes",
            },
        }
        audience = event_for_role(event, "audience")
        presenter = event_for_role(event, "presenter")
        self.assertNotIn("audienceUrl", audience["payload"])
        self.assertNotIn("notesUrl", audience["payload"])
        self.assertEqual(
            presenter["payload"]["audienceUrl"],
            "http://localhost:5173/?role=audience",
        )
        self.assertEqual(
            presenter["payload"]["notesUrl"],
            "http://localhost:5173/?role=presenter&view=notes",
        )

    def test_audience_step_append_carries_no_presenter_content(self):
        event = {
            "type": "step_append",
            "sequence": 5,
            "payload": {"offset": 0, "steps": [[[0], 0, 0, 0, {}]]},
        }

        self.assertIs(event_for_role(event, "audience"), event)
        self.assertIs(event_for_role(event, "presenter"), event)

    def test_audience_never_receives_diagnostics(self):
        event = {
            "type": "diagnostic",
            "payload": {"message": "secret", "path": "/private/talk.py"},
        }

        self.assertIsNone(event_for_role(event, "audience"))
        self.assertIs(event_for_role(event, "presenter"), event)

    def test_audience_snapshot_is_filtered_fail_closed(self):
        event = {
            "type": "trace_snapshot",
            "payload": {
                "trace": {
                    "formatVersion": 2,
                    "files": {"talk.py": 'notes("Private")\n'},
                    "frames": [{
                        "path": "talk.py",
                        "line_number": 1,
                        "function_name": "main",
                        "code": 'notes("Private")',
                    }],
                    "outputs": [""],
                    "renderings": [[{"type": "notes", "data": "Private"}]],
                    "steps": [[[0], 0, 0, 0, {}]],
                }
            },
        }

        audience = event_for_role(event, "audience")
        self.assertEqual(audience["payload"]["trace"]["renderings"], [[]])
        self.assertNotIn("Private", audience["payload"]["trace"]["files"]["talk.py"])
        self.assertNotIn("Private", audience["payload"]["trace"]["frames"][0]["code"])
        self.assertIsNone(event_for_role({"type": "trace_snapshot", "payload": {}}, "audience"))

    def test_audience_reset_receives_redacted_source(self):
        event = {
            "type": "execution_reset",
            "payload": {
                "formatVersion": 2,
                "files": {"talk.py": 'notes("private")'},
                "audienceFiles": {"talk.py": "                "},
                "frames": [],
                "outputs": [""],
                "renderings": [],
                "audienceRenderings": [],
            },
        }

        self.assertEqual(event_for_role(event, "audience")["payload"]["files"], {"talk.py": "                "})
        self.assertEqual(event_for_role(event, "presenter")["payload"]["files"], {"talk.py": 'notes("private")'})
        self.assertNotIn("audienceFiles", event_for_role(event, "presenter")["payload"])

    def test_discovers_loaded_workspace_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "helper.py"
            path.write_text("VALUE = 1\n")
            sys.modules["traceviewer_test_helper"] = types.SimpleNamespace(__file__=str(path))
            try:
                modules = local_modules(Path(directory))
            finally:
                sys.modules.pop("traceviewer_test_helper", None)

        self.assertEqual(modules["traceviewer_test_helper"], path.resolve())

    def test_builds_encoded_viewer_url_and_preserves_viewer_state(self):
        url = viewer_live_url(
            "http://localhost:5173/deck?animate=1#stage",
            "127.0.0.1",
            8765,
            "a token/+",
        )

        self.assertEqual(
            url,
            "http://localhost:5173/deck?animate=1&live=ws%3A%2F%2F127.0.0.1%3A8765%2F&token=a+token%2F%2B#stage",
        )

    def test_extracts_custom_viewer_origin(self):
        self.assertEqual(viewer_origin("https://slides.example/viewer?a=1"), "https://slides.example")

    def test_rejects_relative_viewer_url(self):
        with self.assertRaisesRegex(ValueError, "absolute http"):
            viewer_live_url("/viewer", "127.0.0.1", 8765, "secret")

    def test_builds_tunnel_ready_secure_websocket_url(self):
        self.assertEqual(
            websocket_url("0.0.0.0", 8765, "https://talk.example/live"),
            "wss://talk.example/live",
        )

    def test_accepts_only_valid_presenter_step_controls(self):
        self.assertEqual(presentation_step_from_message({"type": "set_step", "stepIndex": 0}), 0)
        self.assertEqual(presentation_step_from_message({"type": "set_step", "stepIndex": 12}), 12)
        self.assertIsNone(presentation_step_from_message({"type": "set_step", "stepIndex": -1}))
        self.assertIsNone(presentation_step_from_message({"type": "set_step", "stepIndex": True}))
        self.assertIsNone(presentation_step_from_message({"type": "other", "stepIndex": 1}))
        self.assertEqual(
            viewer_live_url(
                "https://talk.example/",
                "0.0.0.0",
                8765,
                "secret",
                role="audience",
                public_url="https://talk.example/socket",
            ),
            "https://talk.example/?live=wss%3A%2F%2Ftalk.example%2Fsocket&token=secret&role=audience",
        )
        self.assertEqual(
            viewer_live_url(
                "https://talk.example/",
                "127.0.0.1",
                8765,
                "secret",
                role="presenter",
                view="notes",
            ),
            "https://talk.example/?live=ws%3A%2F%2F127.0.0.1%3A8765%2F&token=secret&role=presenter&view=notes",
        )


class LiveBrowserTest(unittest.IsolatedAsyncioTestCase):
    async def test_opens_browser_only_after_server_is_ready(self):
        state = {"ready": False, "url": None}

        class StopAfterOpen(Exception):
            pass

        class FakeServer:
            async def __aenter__(self):
                state["ready"] = True

            async def __aexit__(self, *_args):
                return False

        def fake_serve(*_args, **_kwargs):
            return FakeServer()

        def fake_open(url):
            self.assertTrue(state["ready"])
            state["url"] = url
            raise StopAfterOpen

        with (
            patch("traceviewer_producer.live._websocket_serve", return_value=fake_serve),
            patch("traceviewer_producer.live._module_path", return_value=Path(__file__)),
            patch("traceviewer_producer.live.secrets.token_urlsafe", return_value="test-token"),
            patch("traceviewer_producer.live.webbrowser.open", side_effect=fake_open),
        ):
            with self.assertRaises(StopAfterOpen):
                await run_live(
                    "presentations.demo",
                    open_browser=True,
                    viewer_url="http://localhost:5173/?animate=1",
                )

        self.assertEqual(
            state["url"],
            "http://localhost:5173/?animate=1&live=ws%3A%2F%2F127.0.0.1%3A8765%2F&token=test-token.presenter&role=presenter",
        )

    async def test_non_loopback_binding_requires_explicit_opt_in(self):
        with self.assertRaisesRegex(ValueError, "allow_remote=True"):
            await run_live("presentations.demo", host="0.0.0.0")


if __name__ == "__main__":
    unittest.main()
