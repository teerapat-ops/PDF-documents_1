import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

from server import LocalWorkspaceHandler


class LocalWorkspaceServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), LocalWorkspaceHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def test_serves_app_and_required_assets(self):
        for path, content_type in (
            ("/", "text/html"),
            ("/styles.css", "text/css"),
            ("/app.js", "text/javascript"),
        ):
            with self.subTest(path=path):
                connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
                connection.request("GET", path)
                response = connection.getresponse()
                body = response.read()
                self.assertEqual(response.status, 200)
                self.assertIn(content_type, response.getheader("Content-Type", ""))
                self.assertGreater(len(body), 0)
                self.assertEqual(response.getheader("X-Content-Type-Options"), "nosniff")
                connection.close()

    def test_does_not_expose_unlisted_files(self):
        for path in ("/server.py", "/README.md", "/.venv/"):
            with self.subTest(path=path):
                connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
                connection.request("GET", path)
                response = connection.getresponse()
                response.read()
                self.assertEqual(response.status, 404)
                connection.close()


class GroundTruthFixtureTests(unittest.TestCase):
    def test_synthetic_pdf_matches_ground_truth_page_coverage(self):
        fixture_dir = Path(__file__).parent / "fixtures"
        ground_truth = json.loads((fixture_dir / "invoice_ground_truth.json").read_text(encoding="utf-8"))
        pdf_bytes = (fixture_dir / "synthetic-four-page-invoice.pdf").read_bytes()

        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        self.assertIn(b"/Count 4", pdf_bytes)
        self.assertEqual(len(ground_truth["inputPageText"]), ground_truth["expectedPageCount"])
        assigned = [
            page
            for document in ground_truth["expectedDocuments"]
            for page in document["sourcePages"]
        ]
        self.assertEqual(sorted(assigned), list(range(1, ground_truth["expectedPageCount"] + 1)))
        self.assertEqual(
            [len(document["sourcePages"]) for document in ground_truth["expectedDocuments"]],
            ground_truth["expectedExportPageCounts"],
        )


if __name__ == "__main__":
    unittest.main()
