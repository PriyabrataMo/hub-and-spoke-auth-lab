"""Layer 1 - a simulated customer identity provider (Azure AD / Okta / Google Workspace).

It is the only service that knows who the employee actually is. It authenticates the user
and returns a signed ID token to whoever registered as its client (here: the hub).
"""

from flask import Flask, jsonify, redirect, request
from urllib.parse import urlencode

from .common import Signer, TTLStore, page, trace

LOGIN_FORM = """
<h1>Sign in to {{ label }}</h1>
<p class="muted">This is the customer's own login page. Neither the hub nor the app ever sees a password.</p>
<form method="post">
  {% for email, name in users.items() %}
    <label><input type="radio" name="email" value="{{ email }}" {% if email == hint %}checked{% endif %}> {{ name }} <span class="muted">({{ email }})</span></label>
  {% endfor %}
  <p><button type="submit">Authenticate</button></p>
</form>"""


def create_idp_app(key: str, base_url: str, label: str, users: dict[str, str], clients: dict[str, dict]) -> Flask:
    app = Flask(key)
    signer = Signer(base_url)
    codes = TTLStore()

    @app.get("/jwks.json")
    def jwks():
        return jsonify(signer.jwks())

    @app.route("/authorize", methods=["GET", "POST"])
    def authorize():
        client = clients.get(request.values.get("client_id", ""))
        redirect_uri = request.values.get("redirect_uri", "")
        if not client or redirect_uri not in client["redirect_uris"]:
            return page("Error", "<h1 class='err'>Unknown client or redirect_uri</h1>", who=label, status=400)

        if request.method == "GET":
            return page("Sign in", LOGIN_FORM, who=label, label=label, users=users, hint=request.args.get("login_hint", ""))

        email = request.form.get("email")
        if email not in users:
            return page("Error", "<h1 class='err'>Pick a user</h1>", who=label, status=400)
        code = codes.put({
            "email": email,
            "client_id": request.values["client_id"],
            "redirect_uri": redirect_uri,
            "nonce": request.values.get("nonce"),
        })
        trace(key, "authenticated", user=email, note="IdP verified the user and issued an authorization code")
        return redirect(f"{redirect_uri}?{urlencode({'code': code, 'state': request.values.get('state', '')})}")

    @app.post("/token")
    def token():
        client = clients.get(request.form.get("client_id", ""))
        if not client or request.form.get("client_secret") != client["secret"]:
            return jsonify(error="invalid_client"), 401
        grant = codes.pop(request.form.get("code"))
        if not grant or grant["client_id"] != request.form["client_id"] or grant["redirect_uri"] != request.form.get("redirect_uri"):
            return jsonify(error="invalid_grant"), 400
        claims = {
            "sub": f"{key}|{grant['email']}",
            "email": grant["email"],
            "name": users[grant["email"]],
            "nonce": grant["nonce"],
        }
        trace(key, "id_token_issued", claims=claims, note="Signed with the customer IdP's own key")
        return jsonify(id_token=signer.sign(claims, audience=grant["client_id"]), token_type="Bearer")

    return app
