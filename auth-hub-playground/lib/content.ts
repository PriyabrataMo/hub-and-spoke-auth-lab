export type Layer = "app" | "spoke" | "hub" | "idp" | "none"

export const CONCEPTS: { title: string; layer: Layer; body: string }[] = [
  { title: "Identity provider (IdP)", layer: "idp", body: "The system that actually checks who a person is: the customer's Azure AD, Okta, or Google Workspace. It proves identity with a signed token. Nobody else sees the password." },
  { title: "Hub tenant", layer: "hub", body: "One central tenant that holds every customer's connection and has no application logic. It is the only place a customer is ever configured." },
  { title: "Spoke tenant", layer: "spoke", body: "One tenant per app and environment, such as App-A-Dev or App-B-Prod. Its only connection is the hub. It owns that app's roles." },
  { title: "Application (relying party)", layer: "app", body: "Anything that trusts someone else's proof of identity instead of checking passwords. The hub trusts the IdP, the spoke trusts the hub, the app trusts its spoke." },
  { title: "Organization", layer: "hub", body: "A container in the hub for one customer: its connection, branding, and verified email domain such as acme.com." },
  { title: "Home Realm Discovery", layer: "hub", body: "Choosing the right IdP for a user, usually from the email domain. alice@acme.com goes to Acme's Azure AD. This is step 4 of the login lab." },
  { title: "Hub client", layer: "hub", body: "An application registered inside the hub that stands for one spoke. It holds the credentials that spoke uses to call the hub, so a leak from the dev spoke does not expose the prod spoke." },
  { title: "Tenant", layer: "none", body: "An isolated container with its own users, connections, applications, signing keys, and rules. The hub is one tenant; each spoke is another." },
  { title: "Claims", layer: "none", body: "Facts inside a token: email, name, org_name, roles. The IdP supplies identity, the hub adds the organization, the spoke adds roles. The lab colors each claim by who added it." },
  { title: "OIDC and SAML", layer: "none", body: "Two protocols for an IdP to prove identity. SAML sends signed XML, common in older enterprise IdPs. OIDC sends signed JSON tokens. A hub can accept SAML from a customer and issue OIDC to a spoke." },
  { title: "Why every hop re-issues a token", layer: "none", body: "A token is only valid for its issuer and audience. If the app accepted Acme's token directly it would have to trust every customer IdP. Re-issuing means each layer checks one issuer and mints a token for one audience." },
  { title: "Scope is not spoke", layer: "none", body: "An OAuth scope such as openid email profile lists what data a client asks for. A spoke is a tenant in this design. They share nothing but a keyboard slip." },
]

export const COSTS =
  "The hub is a single point of failure: with it offline, no spoke can start a login, though people already signed in keep their sessions. Every hop adds latency and another place to fail. Claim names are a contract between layers. Dev spokes that federate to production IdPs see real employee identities, which can be a compliance problem. Logging out of the app does not log out the spoke, the hub, or the IdP."

export const QUIZ: { q: string; o: string[]; a: number; w: string }[] = [
  { q: "Which tenant holds every customer's enterprise connection?", o: ["Each spoke tenant", "The hub tenant", "The application", "The customer's IdP only"], a: 1, w: "The hub is the only place a customer is configured. Spokes hold a single connection: the hub." },
  { q: "A new customer signs up. What has to change?", o: ["Every spoke tenant", "Every application", "Only the hub", "Nothing, discovery is automatic"], a: 2, w: "Write once: register the organization and its connection in the hub. Every spoke already trusts the hub." },
  { q: "Where do an app's roles live?", o: ["In the customer's IdP", "In the hub", "In the spoke for that app", "In the browser"], a: 2, w: "Authentication comes from upstream; authorization is owned by the spoke. Carol can be admin in App B and viewer in App A." },
  { q: "What does a spoke trust?", o: ["Every customer IdP", "Only the hub's issuer", "Any signed token", "Only tokens from its own app"], a: 1, w: "A spoke verifies one issuer. It learns the organization only from claims the hub puts in the token." },
  { q: "What is the main operational risk of this design?", o: ["Passwords stored in spokes", "The hub is a single point of failure", "Customers cannot use Okta", "Roles cannot be changed"], a: 1, w: "With the hub offline no spoke can start a login. Existing app sessions keep working until they end." },
  { q: "Which check stops a response from a different login being pushed into your session?", o: ["The nonce in the IdP", "state", "The audience", "The signature"], a: 1, w: "The app stores a random state before redirecting and rejects a callback that does not return the same value (login CSRF)." },
  { q: "Why does each hop issue a new token instead of passing the IdP's token along?", o: ["To make logins slower", "Tokens cannot be copied", "Each layer then trusts one issuer and gets a token for one audience", "IdPs forbid forwarding"], a: 2, w: "Re-issuing keeps trust boundaries small and lets each layer add its own claims." },
  { q: 'You see "scope" in a login URL. What is it?', o: ["The spoke tenant's name", "The list of data the client asks for, such as openid email", "The organization id", "The hub client"], a: 1, w: "An OAuth scope is a requested permission or data set. It is unrelated to a spoke." },
]

export const PRESET_EMAILS = ["alice@acme.com", "carol@acme.com", "bob@globex.com", "peter@initech.com", "ghost@acme.com", "eve@unknown.io"]

export const LAYER_STYLES: Record<Exclude<Layer, "none">, { text: string; chip: string; dot: string }> = {
  app: { text: "text-layer-app", chip: "border-layer-app/40 bg-layer-app/10 text-layer-app", dot: "bg-layer-app" },
  spoke: { text: "text-layer-spoke", chip: "border-layer-spoke/40 bg-layer-spoke/10 text-layer-spoke", dot: "bg-layer-spoke" },
  hub: { text: "text-layer-hub", chip: "border-layer-hub/40 bg-layer-hub/10 text-layer-hub", dot: "bg-layer-hub" },
  idp: { text: "text-layer-idp", chip: "border-layer-idp/40 bg-layer-idp/10 text-layer-idp", dot: "bg-layer-idp" },
}
