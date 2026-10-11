# Hub-and-Spoke Auth Lab

A local simulation of the hub-and-spoke identity design in [`../docs/auth-hub-spoke.md`](../docs/auth-hub-spoke.md). It implements a real OIDC authorization-code flow with signed JWTs across four layers. It needs no Auth0 account, no Docker, and no internet.

## Architecture

```text
Browser
  |
  v
App A :9200 / App B :9201          layer 4  relying parties (own session cookie each)
  |                |
  v                v
App-A-Dev :9100   App-B-Prod :9101 layer 3  spoke tenants (own roles, one upstream: the hub)
        \          /
         v        v
       Central Hub :9000           layer 2  Home Realm Discovery + organization registry
        /     |     \
       v      v      v
  Acme :9001  Globex :9002  Initech :9003   layer 1  simulated customer IdPs

Console :9300  service map, organization registry, live hop trace
```

The hub and spokes share one generic broker ([`broker.py`](src/authlab/broker.py)). The only difference is two plug-in functions: how to choose the upstream, and which claims to add.

| | Chooses upstream | Adds claims |
|---|---|---|
| Hub ([`hub.py`](src/authlab/hub.py)) | By email domain (HRD) | `org_id`, `org_name` |
| Spoke ([`spoke.py`](src/authlab/spoke.py)) | Always the hub | `roles` |

## Run it

Requirements: [uv](https://docs.astral.sh/uv/).

```bash
cd auth-hub-lab
uv sync
uv run authlab
```

Open [http://localhost:9300](http://localhost:9300) for the console, then use [App A](http://localhost:9200) or [App B](http://localhost:9201). Ports shift together if you set `AUTHLAB_PORT_BASE`.

Run the end-to-end tests (they use ports 19000+, so they can run beside the lab):

```bash
uv run pytest
```

## Demo users

| Email | Customer | App-A-Dev role | App-B-Prod role |
|---|---|---|---|
| alice@acme.com | Acme Corp | admin | viewer |
| carol@acme.com | Acme Corp | viewer | admin |
| bob@globex.com, dave@globex.com | Globex | viewer | viewer |
| peter@initech.com | Initech | not onboarded yet | not onboarded yet |

## Study workflow

1. Keep the console open. Clear the trace.
2. Log in as `alice@acme.com` on App A. Read each hop in the trace in order.
3. Compare the claims at the IdP, the hub, the spoke, and the app. Who added what?
4. Open `/admin` on App A as Alice, then as Bob. Note who decides roles.
5. Log in as `carol@acme.com` on both apps. Same person, different roles.
6. Try `peter@initech.com`. The hub cannot find an organization.
7. Onboard Initech without restarting anything:

   ```bash
   curl -X POST http://localhost:9000/admin/organizations \
     -H 'Authorization: Bearer demo-hub-admin-token' \
     -H 'Content-Type: application/json' \
     -d '{"domain":"initech.com","name":"Initech","idp":"idp_initech"}'
   ```

8. Retry Peter's login. No spoke changed. That is "write once".
9. Read [`../docs/auth-hub-spoke.md`](../docs/auth-hub-spoke.md) and map each concept to a service.

## Learning milestones

- [x] M1: Four-layer login path with real signed tokens
- [x] M2: Home Realm Discovery and runtime customer onboarding
- [x] M3: Spoke-owned roles and per-environment hub clients
- [x] M4: Live hop trace console
- [x] M5: Security checks covered by tests (redirect URI, state, audience)
- [ ] M6: Kill the hub mid-session and record what still works
- [ ] M7: Rotate a signing key and handle stale JWKS
- [ ] M8: Add PKCE and single logout

## Deliberate limitations

- Keys are generated in memory at startup; there is no persistence or rotation.
- Verifiers fetch JWKS on every login; production caches it.
- Customer IdPs let you pick a user instead of checking a password.
- Plain HTTP on localhost, hard-coded demo secrets, and no rate limiting.
- No PKCE, refresh tokens, or logout propagation.
- The Auth0-specific features (Organizations, Actions, Management API) are modeled, not used. Verify exact Auth0 behavior in its documentation.
