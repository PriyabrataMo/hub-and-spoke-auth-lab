"""Layer 3 - a spoke tenant: one per app + environment. Trusts the hub and nothing else."""

from . import config
from .broker import Client, Upstream, create_broker_app


def create_spoke_app(key: str):
    spec = config.SPOKES[key]
    base_url = config.url(key)
    apps = {k: v for k, v in config.APPS.items() if v["spoke"] == key}
    clients = {a["client_id"]: Client(a["client_id"], a["secret"], (f"{config.url(k)}/callback",)) for k, a in apps.items()}

    # The spoke's ONLY enterprise connection: the hub. It never learns about Okta/Azure AD.
    hub = Upstream(name="hub", base_url=config.url("hub"), client_id=spec["hub_client_id"], client_secret=spec["hub_secret"])

    def resolver(_login_hint):
        return hub

    def enricher(_upstream, claims: dict) -> dict:
        """Authentication came from the hub; authorization (roles) is owned here."""
        roles = spec["roles"].get(claims["email"], spec["default_roles"])
        return {
            "sub": f"{key}|{claims['email']}",
            "email": claims["email"],
            "name": claims["name"],
            "org_id": claims["org_id"],
            "org_name": claims["org_name"],
            "roles": roles,
        }

    return create_broker_app(key, base_url, clients, resolver, enricher, who=f"{spec['label']} tenant (spoke, simulated)")
