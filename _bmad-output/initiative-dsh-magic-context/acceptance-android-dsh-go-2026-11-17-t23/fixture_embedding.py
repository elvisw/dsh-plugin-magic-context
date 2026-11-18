"""Unauthenticated, simulated embedding endpoint for the ONE Android gate."""
import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--journal", type=Path, required=True)
    args = parser.parse_args()
    args.journal.parent.mkdir(parents=True, exist_ok=True)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def respond(self, status, value):
            body = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def record(self, count=0):
            with args.journal.open("a", encoding="utf8") as out:
                out.write(json.dumps({
                    "at": datetime.now(timezone.utc).isoformat(),
                    "method": self.command, "path": self.path.split("?")[0],
                    "inputs": count, "authPresent": bool(self.headers.get("Authorization") or self.headers.get("api-key")),
                    "simulatedProvider": True,
                }) + "\n")

        def do_GET(self):
            self.record()
            if self.headers.get("Authorization") or self.headers.get("api-key"):
                return self.respond(400, {"error": {"message": "fixture requires no credentials"}})
            if self.path.split("?")[0] != "/v1/models":
                return self.respond(404, {"error": {"message": "not found"}})
            self.respond(200, {"object": "list", "data": [
                {"id": "fixture-embed-a", "object": "model", "owned_by": "android-gate-fixture"},
            ]})

        def do_POST(self):
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 65536:
                return self.respond(400, {"error": {"message": "invalid body size"}})
            try:
                body = json.loads(self.rfile.read(size))
                inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
                if not all(isinstance(item, str) for item in inputs):
                    raise ValueError()
            except (ValueError, KeyError, TypeError):
                return self.respond(400, {"error": {"message": "invalid JSON input"}})
            self.record(len(inputs))
            if self.headers.get("Authorization") or self.headers.get("api-key"):
                return self.respond(400, {"error": {"message": "fixture requires no credentials"}})
            if self.path != "/v1/embeddings" or body.get("model") != "fixture-embed-a":
                return self.respond(404, {"error": {"message": "model not found"}})
            data = []
            for index, text in enumerate(inputs):
                raw = hashlib.sha256(text.encode()).digest()[:16]
                vector = [value / 127.5 - 1 for value in raw]
                norm = math.sqrt(sum(value * value for value in vector)) or 1
                data.append({"index": index, "object": "embedding", "embedding": [value / norm for value in vector]})
            self.respond(200, {"object": "list", "model": "fixture-embed-a", "data": data})

    print("simulated embedding fixture: 127.0.0.1:49723", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 49723), Handler).serve_forever()


if __name__ == "__main__":
    main()
