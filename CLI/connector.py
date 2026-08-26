#!/usr/bin/env python3
"""Galla CLI connector.

A small local HTTP service that lets the chat app in your browser work with
the project folders on this machine. Started by `galla connect`.

It always listens on port 4316, on the loopback interface only, and every
request must carry the pairing token that `galla connect` prints. The fixed
port makes it findable; the token is what makes finding it insufficient.
"""

import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 4316
NAME = "Galla CLI"
VERSION = "1.0.0"

WORKSPACE = Path(os.environ.get("GALLA_HOME", Path.home() / "Galla"))
TOKEN = os.environ.get("GALLA_CONNECT_TOKEN", "")

# Pages allowed to talk to us. A browser will not let any other origin read a
# reply, and a JSON content type forces a preflight that other origins fail.
ALLOWED_ORIGINS = {
    "https://trey16885.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
}
for extra in filter(None, os.environ.get("GALLA_ALLOWED_ORIGINS", "").split(",")):
    ALLOWED_ORIGINS.add(extra.strip())

SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+$")


class Denied(Exception):
    """Refused for a reason worth telling the caller."""


def project_dir(name: str) -> Path:
    if not name or not SAFE_NAME.match(name) or name.startswith("."):
        raise Denied(f"{name!r} is not a valid project name")
    path = (WORKSPACE / name).resolve()
    if not str(path).startswith(str(WORKSPACE.resolve())):
        raise Denied("that project is outside the workspace")
    if not path.is_dir():
        raise Denied(f"there is no project called {name!r}")
    return path


def safe_target(root: Path, rel: str) -> Path:
    """A path inside the project, or an error. Absolute paths and .. are out."""
    if not rel or rel.startswith("/") or "\x00" in rel:
        raise Denied("that path is not allowed")
    target = (root / rel).resolve()
    if not str(target).startswith(str(root.resolve()) + os.sep):
        raise Denied("that path points outside the project")
    return target


def list_files(root: Path):
    out = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in (".git", ".galla") for part in rel.parts):
            continue
        out.append({"path": str(rel), "bytes": path.stat().st_size})
    return out


def run_galla(args, cwd=None):
    """Shell out to the CLI so publishing behaves identically either way."""
    galla = os.environ.get("GALLA_BIN") or "galla"
    proc = subprocess.run([galla, *args], capture_output=True, text=True, cwd=cwd,
                          timeout=180)
    return {
        "ok": proc.returncode == 0,
        "output": (proc.stdout + proc.stderr).strip(),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = f"GallaConnector/{VERSION}"

    # -------------------------------------------------------------- plumbing
    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    def _cors(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")

    def _reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _authorised(self) -> bool:
        if not TOKEN:
            return False
        header = self.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header[7:].strip() == TOKEN
        return False

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > 2_000_000:
            raise Denied("that is too large to send in one request")
        # Anything but JSON would skip the browser's preflight, which is part of
        # what keeps other pages from reaching this at all.
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        if ctype != "application/json":
            raise Denied("send application/json")
        try:
            return json.loads(self.rfile.read(length).decode())
        except (ValueError, UnicodeDecodeError):
            raise Denied("that was not valid JSON")

    # --------------------------------------------------------------- methods
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        path = self.path.split("?")[0].rstrip("/") or "/"
        query = {}
        if "?" in self.path:
            from urllib.parse import parse_qs, unquote
            query = {k: unquote(v[0]) for k, v in parse_qs(self.path.split("?", 1)[1]).items()}

        # /health says who is listening without proving anything, so the app can
        # show "found, not paired" rather than a blank failure.
        if path == "/health" and method == "GET":
            return self._reply(200, {
                "name": NAME, "version": VERSION, "port": PORT,
                "paired": self._authorised(),
            })

        if not self._authorised():
            return self._reply(401, {"error": "not paired with this connector"})

        try:
            if path == "/projects" and method == "GET":
                names = sorted(p.name for p in WORKSPACE.iterdir() if p.is_dir()) \
                    if WORKSPACE.is_dir() else []
                return self._reply(200, {"projects": names, "workspace": str(WORKSPACE)})

            if path == "/files" and method == "GET":
                root = project_dir(query.get("project", ""))
                return self._reply(200, {"files": list_files(root)})

            if path == "/file" and method == "GET":
                root = project_dir(query.get("project", ""))
                target = safe_target(root, query.get("path", ""))
                if not target.is_file():
                    raise Denied("no such file")
                if target.stat().st_size > 1_000_000:
                    raise Denied("that file is too big to read over the connector")
                return self._reply(200, {"content": target.read_text(errors="replace")})

            if path == "/file" and method == "POST":
                data = self._body()
                root = project_dir(data.get("project", ""))
                target = safe_target(root, data.get("path", ""))
                existed = target.exists()
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(data.get("content", ""))
                return self._reply(200, {"ok": True, "path": data.get("path"),
                                         "created": not existed})

            if path == "/publish" and method == "POST":
                data = self._body()
                name = data.get("project", "")
                project_dir(name)
                result = run_galla(["publish", name, data.get("message", "Update from Galla")])
                return self._reply(200 if result["ok"] else 500, result)

            return self._reply(404, {"error": f"no such endpoint: {path}"})

        except Denied as exc:
            return self._reply(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            return self._reply(504, {"error": "that took too long"})
        except Exception as exc:                      # noqa: BLE001
            return self._reply(500, {"error": f"{type(exc).__name__}: {exc}"})


def main():
    if not TOKEN:
        sys.stderr.write("galla connect: no pairing token was set.\n")
        return 1
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as exc:
        sys.stderr.write(
            f"galla connect: can't listen on port {PORT} ({exc}).\n"
            "Another connector is probably already running.\n")
        return 1
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.stderr.write("\nDisconnected.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
