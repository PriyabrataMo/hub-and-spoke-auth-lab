"""Layer 2 - the hub tenant: holds every customer connection, has no application logic."""

import threading
from dataclasses import dataclass

from flask import jsonify, request

from . import config
from .broker import Client, NeedsHint, Upstream, create_broker_app
from .common import trace


@dataclass(frozen=True)
class Organization:
    id: str
    name: str
    domain: str
    idp: str  # key into config.IDPS - the organization's enterprise connection


class OrganizationRegistry:
    def __init__(self):
        self._by_domain: dict[str, Organization] = {}
        self._lock = threading.Lock()

    def register(self, domain: str, name: str, idp: str) -> Organization:
        if idp not in config.IDPS:
            raise KeyError(f"unknown idp {idp}")
        org = Organization(id=f"org_{domain.split('.')[0]}", name=name, domain=domain.lower(), idp=idp)
        with self._lock:
            self._by_domain[org.domain] = org
        return org

    def find_by_email(self, email: str) -> Organization | None:
        domain = email.rsplit("@", 1)[-1].lower() if "@" in email else ""
        return self._by_domain.get(domain)

    def all(self) -> list[Organization]:
        return list(self._by_domain.values())


def create_hub_app():
    base_url = config.url("hub")
    registry = OrganizationRegistry()
    for org in config.INITIAL_ORGS:
        registry.register(**org)

    # Each spoke is a *client* of the hub, never a tenant that holds customer connections.
    clients = {
        spoke["hub_client_id"]: Client(spoke["hub_client_id"], spoke["hub_secret"], (f"{config.url(key)}/callback",))
        for key, spoke in config.SPOKES.items()
    }

    def resolver(login_hint: str | None) -> Upstream:
        """Home Realm Discovery: email domain -> organization -> its enterprise connection."""
        if not login_hint:
            raise NeedsHint()
        org = registry.find_by_email(login_hint)
        if org is None:
            raise LookupError(f"No organization registered for {login_hint}")
        trace("hub", "home_realm_discovery", email=login_hint, organization=org.name, connection=org.idp)
        return Upstream(
            name=org.idp, base_url=config.url(org.idp),
            client_id=config.HUB_CLIENT_ID_AT_IDP, client_secret=config.HUB_SECRET_AT_IDP[org.idp],
            extra={"org_id": org.id, "org_name": org.name},
        )

    def enricher(upstream: Upstream, claims: dict) -> dict:
        """The hub's 'post-login Action': stamp organization identity into the token."""
        return {
            "sub": f"hub|{claims['sub']}",
            "email": claims["email"],
            "name": claims["name"],
            "org_id": upstream.extra["org_id"],
            "org_name": upstream.extra["org_name"],
        }

    app = create_broker_app("hub", base_url, clients, resolver, enricher, who="Central Auth Hub (Auth0 hub tenant, simulated)")

    def _authorized() -> bool:
        return request.headers.get("Authorization") == f"Bearer {config.HUB_ADMIN_TOKEN}"

    @app.route("/admin/organizations", methods=["GET", "POST"])
    def organizations():
        """Stand-in for the Auth0 Management API: onboard a customer without touching any spoke."""
        if not _authorized():
            return jsonify(error="unauthorized"), 401
        if request.method == "POST":
            body = request.get_json(force=True)
            try:
                org = registry.register(body["domain"], body["name"], body["idp"])
            except (KeyError, TypeError) as exc:
                return jsonify(error=str(exc)), 400
            trace("hub", "organization_registered", organization=org.name, domain=org.domain,
                  note="No spoke was changed or restarted")
        return jsonify([vars(o) for o in registry.all()])

    return app
