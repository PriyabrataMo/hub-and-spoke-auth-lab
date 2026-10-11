"""The generic OIDC broker used by BOTH the hub and every spoke.

A broker is simultaneously
  - an OIDC *provider* to its downstream client (/authorize, /token, /jwks.json), and
  - an OIDC *client* of exactly one upstream per login (/callback).

The only differences between hub and spoke are two plug-in functions:
  resolver(login_hint) -> Upstream     "which upstream do I send this user to?"
  enricher(upstream, claims) -> dict   "what claims do I put in the token I issue?"

Hub:   resolver = Home Realm Discovery by email domain; enricher adds organization claims.
Spoke: resolver = always the hub;                       enricher adds the spoke's own roles.
"""

from dataclasses import dataclass
from urllib.parse import urlencode
import secrets

import requests
from flask import Flask, jsonify, redirect, request

from .common import Signer, TTLStore, VerificationError, page, trace, verify_id_token


@dataclass(frozen=True)
class Client:
    client_id: str
    secret: str
    redirect_uris: tuple[str, ...]


@dataclass(frozen=True)
class Upstream:
    name: str
    base_url: str
    client_id: str
    client_secret: str
    extra: dict | None = None

    @property
    def authorize_url(self): return f"{self.base_url}/authorize"
    @property
    def token_url(self): return f"{self.base_url}/token"
    @property
    def jwks_url(self): return f"{self.base_url}/jwks.json"


class NeedsHint(Exception):
    """The resolver cannot choose an upstream without an email (identifier-first login)."""


IDENTIFIER_FORM = """
<h1>Sign in</h1>
<p class="muted">Enter your work email. We use its domain to find your company's identity provider (Home Realm Discovery).</p>
<form method="get" action="/authorize">
  {% for k, v in params.items() %}<input type="hidden" name="{{ k }}" value="{{ v }}">{% endfor %}
  <input name="login_hint" type="email" placeholder="you@company.com" required autofocus>
  <button type="submit">Continue</button>
</form>"""


def create_broker_app(name, base_url, clients: dict[str, Client], resolver, enricher, who: str) -> Flask:
    app = Flask(name)
    signer = Signer(base_url)
    codes = TTLStore()          # codes we issue to our downstream client
    transactions = TTLStore()   # logins in flight to an upstream

    @app.get("/jwks.json")
    def jwks():
        return jsonify(signer.jwks())

    @app.get("/.well-known/openid-configuration")
    def discovery():
        return jsonify(issuer=base_url, authorization_endpoint=f"{base_url}/authorize",
                       token_endpoint=f"{base_url}/token", jwks_uri=f"{base_url}/jwks.json")

    @app.get("/authorize")
    def authorize():
        client = clients.get(request.args.get("client_id", ""))
        redirect_uri = request.args.get("redirect_uri", "")
        if not client or redirect_uri not in client.redirect_uris:
            trace(name, "rejected", reason="unknown client or redirect_uri not registered", client_id=request.args.get("client_id"))
            return page("Error", "<h1 class='err'>Unknown client or redirect_uri</h1>", who=who, status=400)

        hint = request.args.get("login_hint")
        try:
            upstream = resolver(hint)
        except NeedsHint:
            return page("Sign in", IDENTIFIER_FORM, who=who, params={k: v for k, v in request.args.items() if k != "login_hint"})
        except LookupError as exc:
            trace(name, "discovery_failed", login_hint=hint, reason=str(exc))
            return page("No organization", "<h1 class='err'>{{ msg }}</h1><p class='muted'>The hub has no organization registered for this email domain.</p>",
                        who=who, status=404, msg=str(exc))

        upstream_nonce = secrets.token_urlsafe(12)
        txn = transactions.put({
            "client_id": client.client_id,
            "redirect_uri": redirect_uri,
            "state": request.args.get("state", ""),
            "nonce": request.args.get("nonce"),
            "upstream": upstream,
            "upstream_nonce": upstream_nonce,
        })
        trace(name, "redirect_upstream", from_client=client.client_id, to=upstream.name, login_hint=hint)
        query = urlencode({
            "response_type": "code", "client_id": upstream.client_id, "redirect_uri": f"{base_url}/callback",
            "state": txn, "nonce": upstream_nonce, "login_hint": hint or "",
        })
        return redirect(f"{upstream.authorize_url}?{query}")

    @app.get("/callback")
    def callback():
        txn = transactions.pop(request.args.get("state"))
        if not txn or "code" not in request.args:
            trace(name, "rejected", reason="unknown/expired state or missing code")
            return page("Error", "<h1 class='err'>Login transaction expired or invalid</h1>", who=who, status=400)
        upstream: Upstream = txn["upstream"]
        try:
            resp = requests.post(upstream.token_url, timeout=5, data={
                "grant_type": "authorization_code", "code": request.args["code"],
                "redirect_uri": f"{base_url}/callback", "client_id": upstream.client_id, "client_secret": upstream.client_secret,
            })
            resp.raise_for_status()
            upstream_claims = verify_id_token(resp.json()["id_token"], upstream.jwks_url, issuer=upstream.base_url,
                                              audience=upstream.client_id, nonce=txn["upstream_nonce"])
        except (requests.RequestException, VerificationError) as exc:
            trace(name, "upstream_failed", upstream=upstream.name, error=str(exc))
            return page("Upstream error", "<h1 class='err'>Upstream login failed</h1><p class='muted'>{{ e }}</p>", who=who, status=502, e=str(exc))

        claims = enricher(upstream, upstream_claims)
        trace(name, "token_mapped", upstream=upstream.name, received=_public(upstream_claims), issued=claims,
              note="Verified the upstream token, then minted a new token with this tenant's own claims")
        code = codes.put({"claims": claims, "client_id": txn["client_id"], "redirect_uri": txn["redirect_uri"], "nonce": txn["nonce"]})
        return redirect(f"{txn['redirect_uri']}?{urlencode({'code': code, 'state': txn['state']})}")

    @app.post("/token")
    def token():
        client = clients.get(request.form.get("client_id", ""))
        if not client or request.form.get("client_secret") != client.secret:
            return jsonify(error="invalid_client"), 401
        grant = codes.pop(request.form.get("code"))
        if not grant or grant["client_id"] != client.client_id or grant["redirect_uri"] != request.form.get("redirect_uri"):
            return jsonify(error="invalid_grant"), 400
        trace(name, "id_token_issued", to=client.client_id, claims=grant["claims"])
        return jsonify(id_token=signer.sign({**grant["claims"], "nonce": grant["nonce"]}, audience=client.client_id), token_type="Bearer")

    return app


def _public(claims: dict) -> dict:
    return {k: v for k, v in claims.items() if k not in {"iat", "exp", "nonce", "aud"}}
