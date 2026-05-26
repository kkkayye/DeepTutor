from __future__ import annotations

import hashlib
import json
import math
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


MODEL = os.getenv("EMBEDDING_SERVER_MODEL", "text-embedding-3-large")
DIMENSION = int(os.getenv("EMBEDDING_SERVER_DIMENSION", "3072"))
PORT = int(os.getenv("EMBEDDING_SERVER_PORT", "8320"))
TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff\uac00-\ud7af]+", re.UNICODE)


def _hash_u64(value: str) -> int:
    return int.from_bytes(hashlib.blake2b(value.encode("utf-8"), digest_size=8).digest(), "big")


def _tokens(text: str) -> list[str]:
    found = [match.group(0).lower() for match in TOKEN_RE.finditer(text)]
    if found:
        return found
    compact = text.strip().lower()
    return [compact] if compact else [""]


def _embedding(text: str) -> list[float]:
    vector = [0.0] * DIMENSION
    tokens = _tokens(text)

    for token in tokens:
        seed = _hash_u64(token)
        vector[seed % DIMENSION] += 1.0 if (seed >> 8) & 1 else -1.0

    for left, right in zip(tokens, tokens[1:]):
        seed = _hash_u64(f"{left} {right}")
        vector[seed % DIMENSION] += 0.5 if (seed >> 9) & 1 else -0.5

    norm = math.sqrt(sum(item * item for item in vector)) or 1.0
    return [round(item / norm, 6) for item in vector]


class Handler(BaseHTTPRequestHandler):
    server_version = "SocartesLocalEmbedding/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path in {"/", "/health"}:
            self._send_json(200, {"status": "ok", "model": MODEL, "dimension": DIMENSION})
            return
        self._send_json(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:
        if self.path.rstrip("/") not in {"/v1/embeddings", "/embeddings"}:
            self._send_json(404, {"error": {"message": "not found"}})
            return

        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            raw_input = payload.get("input", "")
            inputs = raw_input if isinstance(raw_input, list) else [raw_input]
            texts = [str(item) for item in inputs]
            data = [
                {"object": "embedding", "embedding": _embedding(text), "index": index}
                for index, text in enumerate(texts)
            ]
            token_count = sum(len(_tokens(text)) for text in texts)
            self._send_json(
                200,
                {
                    "object": "list",
                    "data": data,
                    "model": payload.get("model") or MODEL,
                    "usage": {"prompt_tokens": token_count, "total_tokens": token_count},
                },
            )
        except Exception as exc:
            self._send_json(400, {"error": {"message": str(exc)}})


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"local embedding server listening on :{PORT}, dim={DIMENSION}", flush=True)
    server.serve_forever()
