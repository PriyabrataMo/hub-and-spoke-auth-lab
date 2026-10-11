"""End-to-end tests: a real browser-like session walks app -> spoke -> hub -> IdP and back."""

import os

import pytest
import requests

os.environ["AUTHLAB_PORT_BASE"] = "19000"
os.environ["AUTHLAB_TRACE"] = "/tmp/authlab-test-trace.jsonl"

from authlab import config  # noqa: E402  (env must be set before import)
from authlab.run import Lab  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def lab():
    running = Lab()
    running.start()
    yield
    running.stop()


def login(app: str, email: str) -> requests.Response:
    """Follow the redirects like a browser: app -> spoke -> hub -> IdP login form, then submit it."""
    session = requests.Session()
    resp = session.get(f"{config.url(app)}/login", params={"email": email})
    assert resp.status_code in (200, 404), resp.text  # 200 = reached IdP form, 404 = hub discovery failed
    if resp.status_code == 404:
        return resp
    final = session.post(resp.url, data={"email": email})
    final.session = session
    return final


def test_acme_admin_logs_in_to_app_a_and_gets_admin_role():
    resp = login("app_a", "alice@acme.com")
    assert resp.status_code == 200
    assert "Hello, Alice Acme" in resp.text
    assert "Acme Corp" in resp.text and "admin" in resp.text
    assert resp.session.get(f"{config.url('app_a')}/admin").status_code == 200


def test_globex_user_is_viewer_and_blocked_from_admin():
    resp = login("app_a", "bob@globex.com")
    assert "Globex" in resp.text and "viewer" in resp.text
    assert resp.session.get(f"{config.url('app_a')}/admin").status_code == 403


def test_roles_are_per_spoke_not_per_user():
    assert login("app_a", "carol@acme.com").session.get(f"{config.url('app_a')}/admin").status_code == 403
    assert login("app_b", "carol@acme.com").session.get(f"{config.url('app_b')}/admin").status_code == 200


def test_unknown_domain_fails_at_hub_then_onboarding_fixes_it_without_touching_spokes():
    assert login("app_a", "peter@initech.com").status_code == 404

    admin = {"Authorization": f"Bearer {config.HUB_ADMIN_TOKEN}"}
    created = requests.post(f"{config.url('hub')}/admin/organizations", headers=admin,
                            json={"domain": "initech.com", "name": "Initech", "idp": "idp_initech"})
    assert created.status_code == 200

    resp = login("app_a", "peter@initech.com")
    assert resp.status_code == 200 and "Initech" in resp.text


def test_hub_rejects_unregistered_redirect_uri():
    resp = requests.get(f"{config.url('hub')}/authorize", params={
        "client_id": "spoke-a-dev", "redirect_uri": "http://evil.example/callback", "state": "x", "login_hint": "alice@acme.com"})
    assert resp.status_code == 400


def test_app_rejects_callback_with_wrong_state():
    session = requests.Session()
    session.get(f"{config.url('app_a')}/login", params={"email": "alice@acme.com"})
    resp = session.get(f"{config.url('app_a')}/callback", params={"code": "x", "state": "forged"})
    assert resp.status_code == 400


def test_app_does_not_accept_a_token_meant_for_another_app():
    """A token issued to app-a must not be accepted by app-b (audience check)."""
    from authlab.common import VerificationError, verify_id_token
    session = requests.Session()
    resp = session.get(f"{config.url('app_a')}/login", params={"email": "alice@acme.com"})
    done = session.post(resp.url, data={"email": "alice@acme.com"})
    assert done.status_code == 200
    token = _fetch_token_for("app_a")
    with pytest.raises(VerificationError):
        verify_id_token(token, f"{config.url('spoke_a_dev')}/jwks.json", issuer=config.url("spoke_a_dev"),
                        audience=config.APPS["app_b"]["client_id"], nonce=None)


def _fetch_token_for(app: str) -> str:
    """Drive a login manually so we can capture the raw ID token the spoke issues."""
    from urllib.parse import parse_qs, urlparse
    spec = config.APPS[app]
    s = requests.Session()
    r = s.get(f"{config.url(spec['spoke'])}/authorize", params={
        "response_type": "code", "client_id": spec["client_id"], "redirect_uri": f"{config.url(app)}/callback",
        "state": "s", "nonce": "n", "login_hint": "alice@acme.com"})
    r = s.post(r.url, data={"email": "alice@acme.com"}, allow_redirects=False)
    while r.is_redirect and not r.headers["Location"].startswith(f"{config.url(app)}/callback"):
        r = s.get(r.headers["Location"], allow_redirects=False)
    code = parse_qs(urlparse(r.headers["Location"]).query)["code"][0]
    tok = requests.post(f"{config.url(spec['spoke'])}/token", data={
        "grant_type": "authorization_code", "code": code, "redirect_uri": f"{config.url(app)}/callback",
        "client_id": spec["client_id"], "client_secret": spec["secret"]})
    return tok.json()["id_token"]
