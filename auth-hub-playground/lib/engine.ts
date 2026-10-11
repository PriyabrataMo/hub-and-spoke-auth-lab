/**
 * Pure simulation of the hub-and-spoke login. It mirrors the Python lab in ../auth-hub-lab
 * (same layers, same claims, same checks) but runs in the browser. Signatures are simulated
 * with a hash so tampering is detectable; real systems use RS256 and a published JWKS.
 */

export type AppKey = "a" | "b"
export type AttackKey = "none" | "redirect_uri" | "state" | "audience" | "tamper"
export type IdpKey = "acme" | "globex" | "initech"
export type NodeId =
  | "user"
  | "app_a"
  | "app_b"
  | "spoke_a"
  | "spoke_b"
  | "hub"
  | "idp_acme"
  | "idp_globex"
  | "idp_initech"
export type Origin = "idp" | "hub" | "spoke" | "env" | "attacker"
export type ClaimValue = string | number | string[]
export type Claims = Record<string, ClaimValue>

export interface Token {
  header: { alg: string; typ: string; kid: string }
  claims: Claims
  origins: Record<string, Origin>
  signer: string
  label: string
  raw: string
  tampered?: boolean
}
export interface Check {
  text: string
  ok: boolean | null
}
export interface Step {
  n: number
  title: string
  status: "ok" | "fail" | "skipped"
  checker: string
  from?: NodeId
  to?: NodeId
  what?: string
  params?: Record<string, string>
  checks: Check[]
  token?: Token
  adds?: string[]
  fail?: { reason: string; why: string }
}
export interface Outcome {
  appKey: AppKey
  email: string
  name: string
  org: string
  roles: string[]
}
export interface Flow {
  input: { appKey: AppKey; email: string; attack: AttackKey }
  now: number
  steps: Step[]
  ok: boolean
  failIndex: number
  finalIndex: number
  outcome: Outcome | null
}
export interface World {
  hubUp: boolean
  registered: Record<string, boolean>
  roles: Record<AppKey, Record<string, string[]>>
  hubChanges: number
  spokeChanges: number
}

/* ---------- simulated signing ---------- */

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function b64(o: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(o))
  let bin = ""
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}
function unb64(s: string): Claims {
  let t = s.replace(/-/g, "+").replace(/_/g, "/")
  while (t.length % 4) t += "="
  const bin = atob(t)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}
function sigOf(key: string, signingInput: string): string {
  const s = `${key}|${signingInput}`
  return cyrb53(s).toString(36).padStart(10, "0") + cyrb53(s, 7).toString(36).padStart(10, "0")
}
function signToken(
  claims: Claims,
  key: string,
  signer: string,
  origins: Record<string, Origin>,
  label: string,
): Token {
  const header = { alg: "RS256", typ: "JWT", kid: key }
  const hd = b64(header)
  const bd = b64(claims)
  return { header, claims, origins, signer, label, raw: `${hd}.${bd}.${sigOf(key, `${hd}.${bd}`)}` }
}
function verifyToken(raw: string, key: string) {
  const [h, p, sig] = raw.split(".")
  const expected = sigOf(key, `${h}.${p}`)
  return { valid: expected === sig, expected, got: sig, claims: unb64(p) }
}
function tamperToken(tok: Token, mutate: (c: Claims) => void): Token {
  const claims = JSON.parse(JSON.stringify(tok.claims)) as Claims
  mutate(claims)
  const [h, , sig] = tok.raw.split(".")
  return { ...tok, claims, tampered: true, raw: `${h}.${b64(claims)}.${sig}` }
}

/* ---------- static configuration (same shape as the Python lab) ---------- */

export const HUB = { iss: "https://hub.example.com", key: "key-hub" }

export const IDPS: Record<IdpKey, { short: string; product: string; label: string; iss: string; key: string; prefix: string }> = {
  acme: { short: "Acme", product: "Azure AD", label: "Acme Corp, Azure AD", iss: "https://login.microsoftonline.com/acme", key: "key-idp-acme", prefix: "azuread" },
  globex: { short: "Globex", product: "Okta", label: "Globex, Okta", iss: "https://globex.okta.com", key: "key-idp-globex", prefix: "okta" },
  initech: { short: "Initech", product: "Google Workspace", label: "Initech, Google Workspace", iss: "https://accounts.google.com/initech", key: "key-idp-initech", prefix: "google" },
}

export const USERS: Record<string, { name: string; idp: IdpKey }> = {
  "alice@acme.com": { name: "Alice Acme", idp: "acme" },
  "carol@acme.com": { name: "Carol Acme", idp: "acme" },
  "bob@globex.com": { name: "Bob Globex", idp: "globex" },
  "peter@initech.com": { name: "Peter Gibbons", idp: "initech" },
}

export const ORG_DEFS: { id: string; domain: string; name: string; idp: IdpKey }[] = [
  { id: "org_acme", domain: "acme.com", name: "Acme Corp", idp: "acme" },
  { id: "org_globex", domain: "globex.com", name: "Globex", idp: "globex" },
  { id: "org_initech", domain: "initech.com", name: "Initech", idp: "initech" },
]

export const APPS: Record<AppKey, { label: string; clientId: string; spoke: AppKey; cb: string }> = {
  a: { label: "App A", clientId: "app-a", spoke: "a", cb: "https://app-a.example.com/callback" },
  b: { label: "App B", clientId: "app-b", spoke: "b", cb: "https://app-b.example.com/callback" },
}

export const SPOKES: Record<AppKey, { label: string; iss: string; key: string; hubClient: string; cb: string }> = {
  a: { label: "App-A-Dev", iss: "https://app-a-dev.example.com", key: "key-spoke-a", hubClient: "spoke-a-dev", cb: "https://app-a-dev.example.com/callback" },
  b: { label: "App-B-Prod", iss: "https://app-b-prod.example.com", key: "key-spoke-b", hubClient: "spoke-b-prod", cb: "https://app-b-prod.example.com/callback" },
}

/** `step` is the step number where the attack is expected to be caught. */
export const ATTACKS: Record<AttackKey, { label: string; desc: string; step?: number }> = {
  none: { label: "No attack", desc: "A normal login." },
  redirect_uri: { label: "Forged redirect_uri", step: 2, desc: "A crafted link points redirect_uri at the attacker's site, hoping to receive your authorization code. Caught at step 2." },
  state: { label: "Forged state", step: 8, desc: "A response that does not belong to the login this browser started is pushed into the app (login CSRF). Caught at step 8." },
  audience: { label: "Token meant for another app", step: 8, desc: "A valid token issued to the other app is replayed here. Caught at step 8." },
  tamper: { label: "Edited token", step: 8, desc: 'The payload is changed after signing to add a made-up "superadmin" role. Caught at step 8.' },
}

export function newWorld(): World {
  return {
    hubUp: true,
    registered: { "acme.com": true, "globex.com": true, "initech.com": false },
    roles: { a: { "alice@acme.com": ["admin"] }, b: { "carol@acme.com": ["admin"] } },
    hubChanges: 0,
    spokeChanges: 0,
  }
}

export function rolesFor(world: World, spoke: AppKey, email: string): string[] {
  return world.roles[spoke][email] ?? ["viewer"]
}

/* ---------- the flow ---------- */

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface CheckDef {
  text: string
  test: () => string | null
  why?: string
}
interface StepDef {
  title: string
  checker: string
  from: () => NodeId
  to: () => NodeId
  what: () => string
  params?: () => Record<string, string>
  token?: () => Token
  adds?: string[]
  checks: () => CheckDef[]
  skippedChecks?: string[]
}

export interface RunOptions {
  /** Epoch milliseconds, injected so the function stays pure. */
  nowMs: number
  /** Seeds the random state/nonce values. */
  seed: string
}

export function runFlow(
  world: World,
  input: { appKey: AppKey; email: string; attack: AttackKey },
  opts: RunOptions,
): Flow {
  const { appKey, email, attack } = input
  const app = APPS[appKey]
  const spoke = SPOKES[app.spoke]
  const spokeNode: NodeId = `spoke_${app.spoke}`
  const appNode: NodeId = `app_${appKey}`
  const domain = email.split("@")[1].toLowerCase()
  const orgDef = ORG_DEFS.find((o) => o.domain === domain)

  const rng = mulberry32(cyrb53(opts.seed))
  const rand = () => Math.floor(rng() * 36 ** 6).toString(36).padStart(6, "0")
  const now = Math.floor(opts.nowMs / 1000)
  const state = `s-${rand()}`
  const nonce = `n-${rand()}`
  const nSpoke = `n-${rand()}`
  const nHub = `n-${rand()}`

  const tok: Record<number, Token> = {}
  let org: (typeof ORG_DEFS)[number] | undefined
  let user: (typeof USERS)[string] | undefined
  const ENV: Record<string, Origin> = { iss: "env", sub: "env", aud: "env", exp: "env", nonce: "env" }

  const tokenChecks = (n: number, key: string, iss: string, aud: string, expectNonce: string): CheckDef[] => {
    const v = () => verifyToken(tok[n].raw, key)
    return [
      {
        text: "Signature is valid for the issuer's key",
        test: () => {
          const r = v()
          return r.valid ? null : `Signature mismatch: expected ${r.expected.slice(0, 8)}…, the token carries ${r.got.slice(0, 8)}….`
        },
        why: "A signed token cannot be edited. Changing any claim breaks the signature, so nobody can promote themselves.",
      },
      {
        text: `iss is ${iss}`,
        test: () => (v().claims.iss === iss ? null : `Issuer is ${v().claims.iss}, expected ${iss}.`),
        why: "Each layer trusts exactly one issuer.",
      },
      {
        text: `aud is ${aud}`,
        test: () => (v().claims.aud === aud ? null : `Audience is "${v().claims.aud}" but this service is "${aud}".`),
        why: "A token is only valid for the audience it was issued to. Otherwise a token meant for App B could be replayed at App A.",
      },
      {
        text: "nonce matches the one we sent",
        test: () => (v().claims.nonce === expectNonce ? null : "nonce mismatch."),
        why: "The nonce ties the token to this login attempt and blocks replay.",
      },
      {
        text: "Token has not expired",
        test: () => ((v().claims.exp as number) > now ? null : "Token expired."),
        why: "Short lifetimes limit how long a stolen token is useful.",
      },
    ]
  }
  const generic = ["Signature is valid for the issuer's key", "iss, aud, nonce and exp are as expected"]
  const redirectSent = attack === "redirect_uri" ? "https://evil.example/callback" : app.cb

  const defs: StepDef[] = [
    {
      title: "You start a login",
      checker: "Browser",
      from: () => "user",
      to: () => appNode,
      what: () => `You type ${email}. ${app.label} keeps no passwords. It hands the login to its spoke tenant, ${spoke.label}, and waits for a signed answer.`,
      checks: () => [],
    },
    {
      title: "The app sends the browser to its spoke",
      checker: spoke.label,
      from: () => appNode,
      to: () => spokeNode,
      what: () => `${app.label} redirects to ${spoke.label}'s /authorize endpoint with a random state and nonce that it will check when the browser returns.`,
      params: () => ({ client_id: app.clientId, redirect_uri: redirectSent, state, nonce, login_hint: email }),
      checks: () => [
        { text: `client_id "${app.clientId}" is registered at ${spoke.label}`, test: () => null },
        {
          text: "redirect_uri exactly matches the registered callback",
          test: () => (redirectSent === app.cb ? null : `${redirectSent} is not registered for client ${app.clientId}.`),
          why: "If the spoke accepted any redirect_uri, an attacker could receive the authorization code and sign in as you.",
        },
      ],
      skippedChecks: [`client_id "${app.clientId}" is registered at ${spoke.label}`, "redirect_uri exactly matches the registered callback"],
    },
    {
      title: "The spoke sends the browser to the hub",
      checker: "Hub",
      from: () => spokeNode,
      to: () => "hub",
      what: () => `${spoke.label} has one enterprise connection: the hub. It has never heard of Okta or Azure AD. It redirects as hub client "${spoke.hubClient}".`,
      params: () => ({ client_id: spoke.hubClient, redirect_uri: spoke.cb, login_hint: email }),
      checks: () => [
        {
          text: "The hub is reachable",
          test: () => (world.hubUp ? null : "The hub is offline, so no spoke can start a new login."),
          why: "This is the price of the design: one hub is one shared point of failure. People who are already signed in keep their app sessions, because apps trust their own session cookie.",
        },
        { text: `Hub client "${spoke.hubClient}" is registered`, test: () => null },
        { text: "redirect_uri matches that hub client", test: () => null },
      ],
      skippedChecks: ["The hub is reachable", `Hub client "${spoke.hubClient}" is registered`, "redirect_uri matches that hub client"],
    },
    {
      title: "The hub finds your company",
      checker: "Hub",
      from: () => "hub",
      to: () => "hub",
      what: () => `Home Realm Discovery: the hub reads the domain "${domain}" from the email and looks it up in its organization registry. A match tells it which customer identity provider to use.`,
      checks: () => [
        {
          text: `An organization is registered for ${domain}`,
          test: () => {
            if (orgDef && world.registered[domain]) {
              org = orgDef
              return null
            }
            return `No organization is registered for ${domain}.`
          },
          why: "Without a registered organization the hub cannot know where to send the user. Onboard the customer in the hub and every app gets the fix at once.",
        },
      ],
      skippedChecks: [`An organization is registered for ${domain}`],
    },
    {
      title: "The hub sends you to your company's login",
      checker: "Customer IdP",
      from: () => "hub",
      to: () => `idp_${org!.idp}` as NodeId,
      what: () => `The browser lands on the ${IDPS[org!.idp].product} login page that ${org!.name} controls. You authenticate there. The hub, the spoke, and the app never see your password.`,
      checks: () => [
        { text: "The hub is a registered client of this identity provider", test: () => null },
        {
          text: "The identity provider has an account for this email",
          test: () => {
            const u = USERS[email]
            if (u && u.idp === org!.idp) {
              user = u
              return null
            }
            return `${IDPS[org!.idp].short} has no account for ${email}.`
          },
          why: "Only the customer's own IdP can say who a person is. The hub never guesses.",
        },
      ],
      skippedChecks: ["The hub is a registered client of this identity provider", "The identity provider has an account for this email"],
    },
    {
      title: "The identity provider returns a signed token",
      checker: "Hub",
      from: () => `idp_${org!.idp}` as NodeId,
      to: () => "hub",
      what: () => `${IDPS[org!.idp].short} returns an ID token to the hub. It knows who you are, and nothing about ${app.label}, roles, or organizations.`,
      token: () => {
        const i = IDPS[org!.idp]
        return signToken(
          { iss: i.iss, sub: `${i.prefix}|${email}`, aud: "hub", exp: now + 300, nonce: nHub, email, name: user!.name },
          i.key,
          i.label,
          { ...ENV, email: "idp", name: "idp" },
          `Token from ${i.short}'s identity provider`,
        )
      },
      adds: ["email", "name"],
      checks: () => {
        const i = IDPS[org!.idp]
        return tokenChecks(6, i.key, i.iss, "hub", nHub)
      },
      skippedChecks: generic,
    },
    {
      title: "The hub adds the organization and re-issues",
      checker: spoke.label,
      from: () => "hub",
      to: () => spokeNode,
      what: () => `The hub verified ${IDPS[org!.idp].short}'s token. Now it mints its own token for ${spoke.label} and stamps the organization into it. This is the hub's post-login step.`,
      token: () => {
        const t = tok[6].claims
        return signToken(
          { iss: HUB.iss, sub: `hub|${t.sub}`, aud: spoke.hubClient, exp: now + 300, nonce: nSpoke, email: t.email, name: t.name, org_id: org!.id, org_name: org!.name },
          HUB.key,
          "Central Auth Hub",
          { ...ENV, email: "idp", name: "idp", org_id: "hub", org_name: "hub" },
          "Token from the hub",
        )
      },
      adds: ["org_id", "org_name"],
      checks: () => tokenChecks(7, HUB.key, HUB.iss, spoke.hubClient, nSpoke),
      skippedChecks: generic,
    },
    {
      title: "The spoke adds roles and re-issues",
      checker: app.label,
      from: () => spokeNode,
      to: () => appNode,
      what: () => `${spoke.label} verified the hub's token and looks up what you may do in this app. Roles belong to the spoke, not to the customer's IdP.`,
      token: () => {
        const t = tok[7].claims
        const good = signToken(
          { iss: spoke.iss, sub: `${spoke.hubClient}|${email}`, aud: app.clientId, exp: now + 300, nonce, email: t.email, name: t.name, org_id: t.org_id, org_name: t.org_name, roles: rolesFor(world, app.spoke, email) },
          spoke.key,
          spoke.label,
          { ...ENV, email: "idp", name: "idp", org_id: "hub", org_name: "hub", roles: "spoke" },
          `Token from ${spoke.label}`,
        )
        if (attack === "tamper") {
          const bad = tamperToken(good, (c) => {
            c.roles = [...(c.roles as string[]), "superadmin"]
          })
          bad.origins = { ...good.origins, roles: "attacker" }
          return bad
        }
        if (attack === "audience") {
          const other = appKey === "a" ? APPS.b : APPS.a
          return signToken({ ...good.claims, aud: other.clientId }, spoke.key, spoke.label, good.origins, `Token from ${spoke.label} (issued for ${other.label})`)
        }
        return good
      },
      adds: ["roles"],
      checks: () => {
        const sent = attack === "state" ? `forged-${rand()}` : state
        return [
          {
            text: "state matches the value the app stored",
            test: () => (sent === state ? null : `state "${sent}" does not match "${state}".`),
            why: "State ties the response to the login this browser started. Without it, an attacker could push their own login result into your session.",
          },
          ...tokenChecks(8, spoke.key, spoke.iss, app.clientId, nonce),
        ]
      },
      skippedChecks: ["state matches the value the app stored", ...generic],
    },
    {
      title: "The app starts its own session",
      checker: app.label,
      from: () => appNode,
      to: () => appNode,
      what: () => `${app.label} accepts the verified claims and sets a session cookie for ${user!.name}. From now on it trusts its own session, not the token. The roles in that session are a snapshot taken now.`,
      checks: () => [{ text: "Claims accepted and a session created", test: () => null }],
      skippedChecks: ["Claims accepted and a session created"],
    },
  ]

  const steps: Step[] = []
  let dead = false
  let failIndex = -1
  defs.forEach((def, idx) => {
    const step: Step = { n: idx + 1, title: def.title, status: "skipped", checker: def.checker, checks: [] }
    if (dead) {
      step.checks = (def.skippedChecks ?? []).map((text) => ({ text, ok: null }))
      steps.push(step)
      return
    }
    step.status = "ok"
    step.from = def.from()
    step.to = def.to()
    step.what = def.what()
    if (def.params) step.params = def.params()
    if (def.token) {
      step.token = def.token()
      tok[idx + 1] = step.token
      step.adds = def.adds
    }
    for (const c of def.checks()) {
      if (step.status === "fail") {
        step.checks.push({ text: c.text, ok: null })
        continue
      }
      const msg = c.test()
      if (msg) {
        step.checks.push({ text: c.text, ok: false })
        step.status = "fail"
        step.fail = { reason: msg, why: c.why ?? "" }
        dead = true
        failIndex = idx
      } else step.checks.push({ text: c.text, ok: true })
    }
    steps.push(step)
  })

  const ok = !dead
  return {
    input,
    now,
    steps,
    ok,
    failIndex,
    finalIndex: ok ? steps.length - 1 : failIndex,
    outcome: ok ? { appKey, email, name: user!.name, org: org!.name, roles: rolesFor(world, app.spoke, email) } : null,
  }
}
