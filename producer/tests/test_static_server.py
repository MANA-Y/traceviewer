import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from traceviewer_producer.static_server import (
    ViewerAssetsNotFound,
    create_viewer_server,
    find_viewer_dist,
    packaged_viewer_path,
)


class StaticServerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.dist = Path(self.temporary.name)
        (self.dist / "index.html").write_text("<h1>viewer</h1>")
        (self.dist / "app.js").write_text("window.viewer = true")
        self.server = create_viewer_server(port=0, dist_path=self.dist)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def read(self, path):
        with urllib.request.urlopen(self.base_url + path) as response:
            return response.status, response.read().decode()

    def test_serves_assets_and_spa_routes(self):
        self.assertEqual(self.read("/app.js"), (200, "window.viewer = true"))
        self.assertEqual(self.read("/presentations/flutter"), (200, "<h1>viewer</h1>"))

    def test_missing_asset_is_not_replaced_with_index(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.read("/missing.js")
        self.assertEqual(error.exception.code, 404)
        error.exception.close()

    def test_rejects_encoded_path_traversal(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.read("/%2e%2e/secret")
        self.assertEqual(error.exception.code, 403)
        error.exception.close()

    def test_resolves_explicit_distribution(self):
        self.assertEqual(find_viewer_dist(self.dist), self.dist.resolve())

    def test_rejects_incomplete_distribution(self):
        with tempfile.TemporaryDirectory() as empty:
            with self.assertRaises(ViewerAssetsNotFound):
                find_viewer_dist(empty)

    def test_serves_files_from_extra_asset_roots(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        extra = Path(self.temporary.name) / "talk-assets"
        extra.mkdir()
        (extra / "assets").mkdir()
        (extra / "assets" / "diagram.png").write_bytes(b"png")
        self.server = create_viewer_server(port=0, dist_path=self.dist, extra_roots=[extra])
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        self.assertEqual(self.read("/assets/diagram.png"), (200, "png"))

    def test_packaged_viewer_path_is_next_to_producer(self):
        import traceviewer_producer

        expected = Path(traceviewer_producer.__file__).resolve().parents[1] / "traceviewer" / "viewer"
        try:
            found = packaged_viewer_path()
        except ViewerAssetsNotFound as error:
            self.assertIn(str(expected), str(error))
        else:
            self.assertEqual(found, expected)


if __name__ == "__main__":
    unittest.main()
