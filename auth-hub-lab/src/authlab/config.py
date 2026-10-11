"""Topology, ports, users, and secrets for the lab.

Everything here is a deliberately hard-coded demo value. A real deployment keeps secrets
in a secret manager and generates a unique secret per client.
"""

import os

PORT_BASE = int(os.environ.get("AUTHLAB_PORT_BASE", "9000"))

OFFSETS = {
    "hub": 0,
    "idp_acme": 1,
    "idp_globex": 2,
    "idp_initech": 3,
    "spoke_a_dev": 100,
    "spoke_b_prod": 101,
    "app_a": 200,
    "app_b": 201,
    "console": 300,
}


def port(name: str) -> int:
    return PORT_BASE + OFFSETS[name]


def url(name: str) -> str:
    # "localhost" (not 127.0.0.1) so the issuer, redirect URIs, and cookies all agree.
    return f"http://localhost:{port(name)}"


# Layer 1: customer identity providers (outside our control in real life).
IDPS = {
    "idp_acme": {
        "label": "Acme Corp - Azure AD (simulated)",
        "users": {"alice@acme.com": "Alice Acme", "carol@acme.com": "Carol Acme"},
    },
    "idp_globex": {
        "label": "Globex - Okta (simulated)",
        "users": {"bob@globex.com": "Bob Globex", "dave@globex.com": "Dave Globex"},
    },
    "idp_initech": {
        "label": "Initech - Google Workspace (simulated)",
        "users": {"peter@initech.com": "Peter Gibbons"},
    },
}

# The hub is registered as a client at every customer IdP.
HUB_CLIENT_ID_AT_IDP = "hub"
HUB_SECRET_AT_IDP = {key: f"demo-secret-hub-at-{key}" for key in IDPS}

# Organizations known to the hub at boot. Initech is intentionally missing:
# onboarding it at runtime is one of the lab exercises.
INITIAL_ORGS = [
    {"domain": "acme.com", "name": "Acme Corp", "idp": "idp_acme"},
    {"domain": "globex.com", "name": "Globex", "idp": "idp_globex"},
]
HUB_ADMIN_TOKEN = "demo-hub-admin-token"

# Layer 3: spoke tenants (one per app + environment). Each is a client of the hub.
SPOKES = {
    "spoke_a_dev": {
        "label": "App-A-Dev",
        "hub_client_id": "spoke-a-dev",
        "hub_secret": "demo-secret-spoke-a-dev",
        "roles": {"alice@acme.com": ["admin"]},
        "default_roles": ["viewer"],
    },
    "spoke_b_prod": {
        "label": "App-B-Prod",
        "hub_client_id": "spoke-b-prod",
        "hub_secret": "demo-secret-spoke-b-prod",
        "roles": {"carol@acme.com": ["admin"]},
        "default_roles": ["viewer"],
    },
}

# Layer 4: the applications. Each trusts exactly one spoke.
APPS = {
    "app_a": {
        "label": "App A",
        "spoke": "spoke_a_dev",
        "client_id": "app-a",
        "secret": "demo-secret-app-a",
    },
    "app_b": {
        "label": "App B",
        "spoke": "spoke_b_prod",
        "client_id": "app-b",
        "secret": "demo-secret-app-b",
    },
}
