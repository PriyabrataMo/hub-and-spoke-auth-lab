# Design a Hub-and-Spoke Identity Federation

Study notes for designing a hub-and-spoke identity federation. Written as an interview-style walkthrough.

## How to use this document

We build the design in layers. Each section answers one question an interviewer may ask. The runnable [auth-hub-lab](../auth-hub-lab/README.md) lets us watch each concept happen, so read a section, then trigger it in the lab.

## 1. Problem statement

A B2B SaaS company sells several applications to many enterprise customers. Each customer wants its employees to sign in with the customer's own login system (Azure AD, Okta, Google Workspace). Design the identity layer so that:

- a customer configures single sign-on **once**, not once per application;
- every application and every environment (dev, stage, prod) can authenticate those employees;
- applications stay isolated from each other and from customers' connection secrets.

```text
alice@acme.com ──> App-A (dev)  ─┐
                   App-A (prod) ─┼─> ??? ──> Acme's Azure AD
bob@globex.com ──> App-B (prod) ─┘          Globex's Okta
```

The answer in this document is a **hub-and-spoke** design on Auth0: one central tenant brokers every customer login, and every app environment is a separate tenant that trusts only that hub.

## 2. Why not connect every app to every customer?

Without a hub, each application tenant holds its own connection to each customer.

```text
connections to configure = customers x app-environments
50 customers x 3 apps x 3 environments = 450 connections, each with its own secrets
```

Onboarding one customer means changing every tenant. A hub reduces that to `customers + app-environments` (50 + 9 = 59).

## 3. Initial scope

### In scope

- Federated login from customer IdPs through a central hub to application tenants.
- Home Realm Discovery: choose the right customer IdP from the user's email.
- Carrying customer (organization) identity into every application.
- Per-application authorization (roles) owned by the spoke.
- Onboarding a customer without touching any spoke.

### Out of scope for the first version

- Self-service SSO setup wizard for customers.
- SCIM user provisioning and deprovisioning.
- Single logout across all layers.
- Machine-to-machine tokens.
- Passwordless and MFA policy design.

## 4. Questions to clarify in an interview

- How many customers, and how fast are we onboarding them?
- How many applications and environments?
- SAML, OIDC, or both from customers?
- Must dev/stage authenticate real customer identities, or test identities only?
- Is a customer's login data allowed to be visible in non-production environments?
- What happens to every application when the hub is down?
- Who owns roles: the customer, the hub, or each application?
- Do users ever belong to more than one customer?

## 5. First assumptions

Fill these in during the session and keep them honest:

| Assumption | Value |
|---|---|
| Customers | ? |
| Application environments (spokes) | ? |
| Peak logins per second | ? |
| Session length before re-login | ? |
| Availability target of the hub | ? |

## 6. Core concepts

### Identity provider (IdP)
The system that actually checks who a person is. In this design: the customer's own Azure AD, Okta, or Google Workspace. It proves identity with a signed SAML assertion or OIDC token. The hub never sees the customer's password.

### Relying party / service provider
Anything that trusts an IdP's proof instead of checking passwords itself. In this design the hub is a relying party of the customer IdPs, a spoke is a relying party of the hub, and the application is a relying party of its spoke. Each hop trusts the next one up.

### Tenant
An isolated Auth0 account-like container: its own users, connections, applications, signing keys, and rules. The hub is one tenant. Every app environment is another tenant.

### Hub tenant
The one central tenant. It holds every customer's enterprise connection and has no application logic.

### Organization
A container inside the hub for one customer. It carries that customer's connection, branding, and verified email domain.

### Spoke tenant
A tenant for one app and environment (`App-A-Dev`, `App-B-Prod`). Its only enterprise connection points at the hub. It owns that app's roles and permissions.

### Hub client
An OIDC application registered inside the hub that represents one spoke. It holds the credentials the spoke uses to call the hub, and the spoke's callback URL.

### Home Realm Discovery (HRD)
Choosing which IdP should authenticate this user, normally from the email domain: `acme.com` means Acme's Azure AD.

### OIDC vs SAML
Both are protocols for an IdP to prove identity to a relying party. SAML uses signed XML assertions and is common in older enterprise IdPs. OIDC (built on OAuth 2.0) uses signed JSON Web Tokens. A hub also **translates**: it can accept SAML from a customer and issue OIDC to a spoke.

### Claims
Facts inside the ID token: `email`, `name`, `org_id`, `roles`. The hub adds organization claims; the spoke adds roles.

### OAuth scope is a different thing
A *scope* (`openid email profile`) is the list of data or permissions a client asks for. It is unrelated to *spoke*. If you hear "scope" in a login URL, it is the OAuth parameter.

## 7. First-pass architecture

```text
Layer 4  Application        App A            App B
                               |                |
Layer 3  Spoke tenant      App-A-Dev        App-B-Prod        (one per app + environment)
                                \              /
Layer 2  Hub tenant          Central Auth Hub                  (one connection per customer)
                              /       |        \
Layer 1  Customer IdP     Acme      Globex     Initech        (Azure AD / Okta / Google)
```

### Login path

```text
1. User opens App A and types alice@acme.com.
2. App A redirects to its spoke (App-A-Dev) with login_hint=alice@acme.com.
3. The spoke's only connection is the hub, so it redirects to the hub.
4. The hub runs Home Realm Discovery: acme.com -> Acme organization -> Acme's IdP.
5. The hub redirects to Acme's IdP. Alice authenticates there.
6. Acme's IdP returns a signed token to the hub.
7. The hub verifies it and issues its own token with organization claims.
8. The spoke verifies the hub's token and issues its own token with roles.
9. App A verifies the spoke's token and creates a local session.
```

Each arrow is the OIDC authorization-code flow. Each service is a *client upward* and a *provider downward*. The lab implements exactly this with one reusable broker for both the hub and the spokes.

### Why each hop re-issues a token

A token is only meaningful to its audience (`aud`) and issuer (`iss`). If the app accepted Acme's token directly it would have to trust every customer IdP. Re-issuing means each layer verifies one issuer and mints a token for exactly one audience.

## 8. What the design buys

- **Write once.** Onboarding a customer changes only the hub.
- **One trust anchor per spoke.** A spoke trusts one issuer, so there is one JWKS endpoint to validate and one set of credentials to rotate.
- **Isolation.** A compromised dev client secret exposes one hub client, not customer connection secrets.
- **Authorization stays local.** Roles live in the spoke, so the same person can be an admin in one app and a viewer in another.

## 9. What it costs

- **The hub is a single point of failure.** If it is down, no spoke can complete a login. Existing application sessions keep working until they expire.
- **Extra hops add latency** and each hop is another place a login can fail.
- **Dev environments see real identities** if they federate to production IdPs. This is a convenience *and* a compliance question; clarify it rather than presenting it only as a benefit.
- **Claim mapping is a contract.** If the hub renames `org_id`, every spoke can break.
- **Logout does not propagate.** Ending the app session does not end the spoke, hub, or IdP sessions.

## 10. Security checklist (verified in the lab)

| Check | Where | Defends against |
|---|---|---|
| Exact `redirect_uri` match | hub, spoke, IdP | Stolen authorization codes |
| `state` round-trip | app, brokers | Login CSRF |
| `nonce` in ID token | each hop | Token replay |
| Signature + `iss` + `aud` + `exp` | each verifier | Forged or misdirected tokens |
| Single-use, short-lived codes | each provider | Code replay |
| Client secret on the token call | each provider | Anyone intercepting a code |
| Separate hub client per spoke | hub | Dev leak affecting prod |

Not implemented in the lab (good follow-ups): PKCE, key rotation, refresh tokens, rate limiting, and single logout.

## 11. Failure modes to rehearse

1. **Hub outage.** What still works? What is cached? What should the app show?
2. **Unknown email domain.** HRD finds no organization (lab exercise 4).
3. **Two organizations claim the same domain.** Who wins, and who verifies ownership?
4. **Customer rotates their IdP signing key.** The hub must refresh that JWKS.
5. **A customer is offboarded.** What revokes existing sessions in every spoke?
6. **A user moves companies.** Is identity keyed on email or on a stable `sub`?
7. **Clock skew** between services breaks `exp` and `iat` checks.

## 12. Decisions we will study next

- Where roles should live: customer IdP groups, hub, or spoke.
- Identity keying: email versus immutable subject identifiers.
- Single logout and session lifetime across four layers.
- Hub high availability, multi-region, and caching of JWKS and discovery documents.
- Production isolation: should production spokes use a separate hub from non-production?

## 13. Exercises

- [ ] Explain the difference between an IdP, a relying party, and a tenant.
- [ ] Compute connections needed with and without a hub for 200 customers and 4 apps x 3 environments.
- [ ] Draw the nine-step login path from memory.
- [ ] In the lab, log in as `alice@acme.com` on App A and identify which service added `org_name`, and which added `roles`.
- [ ] Log in as `carol@acme.com` on App A, then App B. Explain why the roles differ.
- [ ] Log in as `peter@initech.com`. Read the failure in the trace. Then onboard Initech with `curl` (see the lab README) and retry **without restarting anything**.
- [ ] Find where a forged `state` is rejected. Find where a token for the wrong audience is rejected.
- [ ] List what is lost if the hub is killed while a user is already signed in to App A.
- [ ] Decide whether dev spokes should federate to production IdPs, and defend it.

## 14. Claims worth checking before you repeat them

Explanations of this pattern circulate widely and some statements are imprecise. These are the ones to verify.

| Claim | Verdict |
|---|---|
| Hub holds all customer connections; spokes trust only the hub | Correct. This is the core pattern. |
| "Spokes trust Organizations, not individual connections" | Imprecise. A spoke trusts the **hub's issuer**. It learns about the organization only through claims the hub puts in the token. |
| "Dev and stage can authenticate real production IdPs" presented as a benefit | One-sided. It means real employee identities reach non-production tenants, which can be a compliance problem. |
| "A compromised dev secret has a smaller blast radius" | Plausible, and true if each spoke has its own hub client, as designed here. |
| `login_hint` drives home realm discovery | The mechanism is Auth0-specific. The lab models HRD by email domain. Confirm the exact Auth0 behavior against its docs before quoting it. |
| The hub is a single point of failure | Correct, and the most important trade-off to state. |
| Hub and spoke is about OAuth "scope" | No. A *spoke* is a tenant. OAuth *scope* is the list of data a client requests (see section 6). |

## 15. How to drive the interview

1. Restate: customers log in with their own IdP; many apps and environments must trust that login.
2. Show the N x M connection problem, then introduce the hub to remove it.
3. Draw the four layers and name each role.
4. Walk the login path, saying what each hop verifies and what it adds.
5. Explain why every hop re-issues a token (audience and trust boundaries).
6. Cover Home Realm Discovery and onboarding without touching spokes.
7. Cover security: redirect URIs, state, nonce, audience, secrets.
8. State the costs: hub is a single point of failure, latency, logout, claim contracts.
9. Close with availability, key rotation, and the dev-environment identity question.
