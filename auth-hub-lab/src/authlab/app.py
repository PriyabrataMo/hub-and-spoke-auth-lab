"""Layer 4 - an application (relying party). It trusts one spoke and has no idea the hub exists."""

import secrets
from urllib.parse import urlencode

import requests
from flask import Flask, abort, redirect, request, session

from . import config
from .common import VerificationError, page, trace, verify_id_token

HOME = """
{% if user %}
  <h1>Hello, {{ user.name }}</h1>
  <p class="muted">You are signed in to <b>{{ label }}</b> through <b>{{ spoke }}</b>. The claims below came from the token this app verified.</p>
  <table>{% for k, v in user.items() %}<tr><th>{{ k }}</th><td><code>{{ v }}</code></td></tr>{% endfor %}</table>
  <p><a class="btn" href="/admin">Open admin page (needs role "admin")</a> &nbsp; <a href="/logout">Log out (local session only)</a></p>
{% else %}
  <h1>{{ label }}</h1>
  <p class="muted">Not signed in. Enter an email to start the login; the app will send it to <b>{{ spoke }}</b> as <code>login_hint</code>.</p>
  <form action="/login"><input name="email" type="email" placeholder="alice@acme.com" required> <button>Log in</button></form>
{% endif %}"""


def create_app(key: str) -> Flask:
    spec = config.APPS[key]
    spoke_url = config.url(spec["spoke"])
    base_url = config.url(key)

    app = Flask(key)
    app.secret_key = secrets.token_hex(16)
    # Browsers share cookies across ports on the same host, so each app needs its own cookie name.
    app.config["SESSION_COOKIE_NAME"] = f"session-{key}"

    @app.get("/")
    def home():
        return page(spec["label"], HOME, who=f"{spec['label']} (application)", user=session.get("user"),
                    label=spec["label"], spoke=config.SPOKES[spec["spoke"]]["label"])

    @app.get("/login")
    def login():
        session["state"], session["nonce"] = secrets.token_urlsafe(16), secrets.token_urlsafe(16)
        trace(key, "login_started", login_hint=request.args.get("email"), sent_to=spec["spoke"])
        return redirect(f"{spoke_url}/authorize?" + urlencode({
            "response_type": "code", "client_id": spec["client_id"], "redirect_uri": f"{base_url}/callback",
            "state": session["state"], "nonce": session["nonce"], "login_hint": request.args.get("email", ""),
        }))

    @app.get("/callback")
    def callback():
        if not request.args.get("state") or request.args.get("state") != session.pop("state", None):
            trace(key, "rejected", reason="state mismatch (possible CSRF)")
            abort(400, "state mismatch")
        try:
            resp = requests.post(f"{spoke_url}/token", timeout=5, data={
                "grant_type": "authorization_code", "code": request.args.get("code", ""),
                "redirect_uri": f"{base_url}/callback", "client_id": spec["client_id"], "client_secret": spec["secret"],
            })
            resp.raise_for_status()
            claims = verify_id_token(resp.json()["id_token"], f"{spoke_url}/jwks.json", issuer=spoke_url,
                                     audience=spec["client_id"], nonce=session.pop("nonce", None))
        except (requests.RequestException, VerificationError) as exc:
            trace(key, "login_failed", error=str(exc))
            abort(502, f"login failed: {exc}")
        session["user"] = {k: v for k, v in claims.items() if k not in {"iat", "exp", "nonce", "aud"}}
        trace(key, "session_created", user=session["user"], note="App verified the spoke's token and created a local session")
        return redirect("/")

    @app.get("/admin")
    def admin():
        user = session.get("user")
        if not user:
            return redirect("/")
        if "admin" not in user.get("roles", []):
            return page("Forbidden", "<h1 class='err'>403 - requires the admin role</h1><p class='muted'>Your roles: {{ roles }}. Roles are owned by the spoke, not the customer's IdP.</p>",
                        who=spec["label"], status=403, roles=user.get("roles"))
        return page("Admin", "<h1>Admin page</h1><p>Welcome, {{ name }}. The {{ spoke }} tenant granted you <code>admin</code>.</p>",
                    who=spec["label"], name=user["name"], spoke=config.SPOKES[spec["spoke"]]["label"])

    @app.get("/logout")
    def logout():
        session.clear()
        return redirect("/")

    return app
