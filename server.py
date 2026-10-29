"""Serve the local PDF workspace without exposing other files in the project."""

from __future__ import annotations

import argparse
import ipaddress
import mimetypes
import socket
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
PUBLIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
}


class LocalWorkspaceHandler(BaseHTTPRequestHandler):
    """Expose only the static files needed by the browser app."""

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        entry = PUBLIC_FILES.get(path)
        if entry is not None:
            filename, content_type = entry
        elif path.startswith("/vendor/"):
            relative_name = path.removeprefix("/vendor/")
            allowed_files = {
                "pdf.min.js", "pdf.worker.min.js", "pdf-lib.min.js",
                "tesseract.min.js", "tesseract-worker.min.js", "jszip.min.js",
                "tesseract-core.wasm.js", "tesseract-core-lstm.wasm.js",
                "tesseract-core.wasm", "tesseract-core-lstm.wasm",
                "ocr-data/tha.traineddata.gz", "ocr-data/eng.traineddata.gz",
            }
            if relative_name not in allowed_files:
                self.send_error(404, "Not found")
                return
            filename = f"vendor/{relative_name}"
            if relative_name.endswith(".gz"):
                content_type = "application/gzip"
            else:
                content_type = mimetypes.guess_type(relative_name)[0] or "application/javascript"
        else:
            self.send_error(404, "Not found")
            return

        try:
            body = (ROOT / filename).read_bytes()
        except OSError:
            self.send_error(500, "Workspace file could not be read")
            return

        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(filename)[0])
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        # Avoid logging request data that could contain local filenames.
        return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Document Desk local PDF workspace.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address: 127.0.0.1 for this computer or 0.0.0.0 for LAN access")
    parser.add_argument("--port", type=int, default=8000, help="Local port (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser window")
    return parser.parse_args()


def get_lan_ipv4_addresses() -> list[str]:
    addresses: set[str] = set()
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            address = info[4][0]
            if ipaddress.ip_address(address).is_private:
                addresses.add(address)
    except OSError:
        pass
    return sorted(addresses)


def main() -> None:
    args = parse_args()
    loopback_hosts = {"127.0.0.1", "localhost", "::1"}
    lan_bind_allowed = args.host == "0.0.0.0"
    try:
        requested_address = ipaddress.ip_address(args.host)
        lan_bind_allowed = lan_bind_allowed or requested_address.is_private
    except ValueError:
        requested_address = None

    if args.host not in loopback_hosts and not lan_bind_allowed:
        raise SystemExit("Host must be loopback (127.0.0.1), 0.0.0.0, or a private-network IPv4 address.")

    server = ThreadingHTTPServer((args.host, args.port), LocalWorkspaceHandler)
    if args.host == "0.0.0.0":
        print("Document Desk LAN access:")
        addresses = get_lan_ipv4_addresses()
        if addresses:
            for address in addresses:
                print(f"  http://{address}:{server.server_address[1]}/")
        else:
            print(f"  http://<computer Wi-Fi/Ethernet address>:{server.server_address[1]}/")
        url = "http://127.0.0.1:{}/".format(server.server_address[1])
    elif args.host == "::1":
        url = f"http://[::1]:{server.server_address[1]}/"
    else:
        url = f"http://{args.host}:{server.server_address[1]}/"
    print(f"Document Desk is available at {url}")
    print("Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Document Desk.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
