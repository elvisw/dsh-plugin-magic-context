"""Local fake OpenAI-compatible embedding endpoint that REQUIRES a bearer key.

This is a local simulation, not a real provider. It records only the presence
and a short hash of the Authorization header, never the value, so the gate can
prove that the credential saved through the settings UI reached the request.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time

WIDTH = 16
MODEL = "fixture-embed-a"


class Handler(BaseHTTPRequestHandler):
    root: Path
    log_path: Path
    secret: str
    lock = threading.Lock()

    def log_message(self, _format: str, *_args: object) -> None:
        pass

    def _send(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("access-control-allow-origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        return self.headers.get("authorization", "") == "Bearer " + self.secret

    def _record(self, path: str, count: int, authorized: bool) -> None:
        header = self.headers.get("authorization", "")
        digest = hashlib.sha256(header.encode("utf-8")).hexdigest()[:12] if header else "none"
        with self.lock:
            with self.log_path.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({
                    "at": time.time(),
                    "path": path,
                    "inputCount": count,
                    "auth": authorized,
                    "authHash": digest,
                }) + "\n")

    def do_GET(self) -> None:
        if self.path == "/stats":
            lines = self.log_path.read_text(encoding="utf-8").splitlines() if self.log_path.exists() else []
            self._send(200, {
                "width": WIDTH,
                "model": MODEL,
                "requests": [json.loads(line) for line in lines if line.strip()],
            })
            return
        if self.path.startswith("/v1/models"):
            if not self._authorized():
                self._record("models", 0, False)
                self._send(401, {"error": "missing bearer"})
                return
            self._record("models", 0, True)
            self._send(200, {
                "object": "list",
                "data": [
                    {"id": MODEL, "object": "model"},
                    {"id": "fixture-embed-b", "object": "model"},
                ],
            })
            return
        self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self.path.startswith("/v1/embeddings"):
            self._send(404, {"error": "not found"})
            return
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length > 0 else b""
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send(400, {"error": "bad json"})
            return
        if not self._authorized():
            self._record("embeddings", 0, False)
            self._send(401, {"error": "missing bearer"})
            return
        texts = payload.get("input")
        if not isinstance(texts, list):
            texts = [texts]
        self._record("embeddings", len(texts), True)
        data = []
        for index, _text in enumerate(texts):
            vector = [1.0 if i == 0 else 0.01 for i in range(WIDTH)]
            data.append({"object": "embedding", "index": index, "embedding": vector})
        self._send(200, {
            "object": "list",
            "model": MODEL,
            "data": data,
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--root", required=True)
    parser.add_argument("--secret-file", required=True)
    args = parser.parse_args()
    root = Path(args.root)
    root.mkdir(parents=True, exist_ok=True)
    secret = Path(args.secret_file).read_text(encoding="utf-8").strip()
    if secret == "":
        raise SystemExit("empty secret")
    log_path = root / "embedding-requests.jsonl"
    log_path.write_text("", encoding="utf-8")
    Handler.root = root
    Handler.log_path = log_path
    Handler.secret = secret
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    (root / "fake-server.json").write_text(json.dumps({"port": args.port, "model": MODEL, "width": WIDTH}) + "\n", encoding="utf-8")
    print(json.dumps({"port": args.port, "root": str(root)}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
