"""Shared building blocks: JWT signing/verifying, single-use code store, trace log, HTML."""

import json
import os
import secrets
import threading
import time
from pathlib import Path

import jwt
import requests
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import render_template_string
from jwt.algorithms import RSAAlgorithm
from markupsafe import Markup

TRACE_PATH = Path(os.environ.get("AUTHLAB_TRACE", Path.cwd() / ".run" / "trace.jsonl"))
_trace_lock = threading.Lock()


def trace(service: str, event: str, **detail) -> None:
    """Append one hop to the shared trace file that the console renders live."""
    TRACE_PATH.parent.mkdir(parents=True, exist_ok=True)
    record = {"t": time.time(), "service": service, "event": event, "detail": detail}
    with _trace_lock, TRACE_PATH.open("a") as fh:
        fh.write(json.dumps(record, default=str) + "\n")


def read_trace(limit: int = 80) -> list[dict]:
    if not TRACE_PATH.exists():
        return []
    lines = TRACE_PATH.read_text().splitlines()[-limit:]
    return [json.loads(line) for line in lines]


def reset_trace() -> None:
    TRACE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TRACE_PATH.write_text("")


class Signer:
    """One RSA key pair per service. The public half is published at /jwks.json."""

    def __init__(self, issuer: str):
        self.issuer = issuer
        self.kid = secrets.token_hex(4)
        self._private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def sign(self, claims: dict, audience: str, ttl: int = 300) -> str:
        now = int(time.time())
        payload = {**claims, "iss": self.issuer, "aud": audience, "iat": now, "exp": now + ttl}
        return jwt.encode(payload, self._private, algorithm="RS256", headers={"kid": self.kid})

    def jwks(self) -> dict:
        jwk = RSAAlgorithm.to_jwk(self._private.public_key(), as_dict=True)
        return {"keys": [{**jwk, "kid": self.kid, "use": "sig", "alg": "RS256"}]}


class VerificationError(Exception):
    pass


def verify_id_token(token: str, jwks_url: str, issuer: str, audience: str, nonce: str | None) -> dict:
    """Verify signature, issuer, audience, expiry, and nonce of an upstream ID token."""
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        keys = requests.get(jwks_url, timeout=5).json()["keys"]
        jwk = next(k for k in keys if k["kid"] == kid)
        key = RSAAlgorithm.from_jwk(json.dumps(jwk))
        claims = jwt.decode(token, key, algorithms=["RS256"], audience=audience, issuer=issuer, leeway=5)
    except (jwt.PyJWTError, StopIteration, requests.RequestException, KeyError, ValueError) as exc:
        raise VerificationError(f"{type(exc).__name__}: {exc}") from exc
    if nonce is not None and claims.get("nonce") != nonce:
        raise VerificationError("nonce mismatch")
    return claims


class TTLStore:
    """Single-use, short-lived values: authorization codes and in-flight login transactions."""

    def __init__(self, ttl: int = 300):
        self._ttl = ttl
        self._items: dict[str, tuple[float, dict]] = {}
        self._lock = threading.Lock()

    def put(self, value: dict) -> str:
        key = secrets.token_urlsafe(24)
        with self._lock:
            self._items[key] = (time.time() + self._ttl, value)
        return key

    def pop(self, key: str | None) -> dict | None:
        with self._lock:
            expires, value = self._items.pop(key, (0, None))
        return value if value is not None and expires > time.time() else None


BASE_TEMPLATE = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{ title }}</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --fg:#14161a; --card:#fff; --line:#d9dce1; --accent:#2457d6; --muted:#5d6470; }
  @media (prefers-color-scheme: dark) { :root { --bg:#14161a; --fg:#eceef2; --card:#1d2026; --line:#333844; --accent:#7ea2ff; --muted:#9aa2b1; } }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,sans-serif; }
  main { max-width:760px; margin:40px auto; padding:0 16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:20px 24px; }
  .who { font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
  h1 { font-size:20px; margin:0 0 12px; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  td,th { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; word-break:break-all; }
  code { font-family:ui-monospace,monospace; font-size:12.5px; }
  input,button,select { font:inherit; padding:8px 12px; border-radius:6px; border:1px solid var(--line); background:var(--card); color:var(--fg); }
  button,.btn { background:var(--accent); color:#fff; border-color:var(--accent); cursor:pointer; text-decoration:none; display:inline-block; padding:8px 12px; border-radius:6px; }
  .muted { color:var(--muted); } .err { color:#c0392b; }
  label { display:block; padding:6px 0; }
</style>
<main><div class="card">{% if who %}<div class="who">{{ who }}</div>{% endif %}{{ body }}</div></main>"""


def page(title: str, template: str, who: str | None = None, status: int = 200, **ctx):
    body = Markup(render_template_string(template, **ctx))
    return render_template_string(BASE_TEMPLATE, title=title, body=body, who=who), status
