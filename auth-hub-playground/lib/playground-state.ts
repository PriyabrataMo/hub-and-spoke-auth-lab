import {
  ATTACKS,
  newWorld,
  rolesFor,
  runFlow,
  type AppKey,
  type AttackKey,
  type Flow,
  type World,
} from "./engine"

export interface Session {
  appKey: AppKey
  email: string
  name: string
  org: string
  roles: string[]
}

export interface Mission {
  id: string
  text: string
}

export const MISSIONS: Mission[] = [
  { id: "m1", text: "Sign in as alice@acme.com on App A." },
  { id: "m2", text: "Make a login fail because the hub has no organization for the email domain." },
  { id: "m3", text: "Try peter@initech.com first and watch it fail, then onboard Initech in the hub and sign in as Peter again, without changing any spoke." },
  { id: "m4", text: "Sign in as carol@acme.com on both apps and compare her roles." },
  { id: "m5", text: "Switch the hub off: a new login fails while an existing session stays signed in." },
  { id: "m6", text: "Catch all four attacks." },
  { id: "m7", text: "Make bob@globex.com an admin on App A, then sign in as Bob." },
]

const REAL_ATTACKS: AttackKey[] = ["redirect_uri", "state", "audience", "tamper"]

export interface State {
  world: World
  appKey: AppKey
  email: string
  attack: AttackKey
  flow: Flow | null
  cur: number
  playing: boolean
  recorded: boolean
  sessions: Session[]
  missions: Record<string, boolean>
  caught: AttackKey[]
  initechFailedAtSpokeChanges: number | null
  carol: { a: boolean; b: boolean }
  lastDone: string | null
}

export const initialState: State = {
  world: newWorld(),
  appKey: "a",
  email: "alice@acme.com",
  attack: "none",
  flow: null,
  cur: 0,
  playing: false,
  recorded: false,
  sessions: [],
  missions: {},
  caught: [],
  initechFailedAtSpokeChanges: null,
  carol: { a: false, b: false },
  lastDone: null,
}

type Fresh = { seed: string; now: number }

export type Action =
  | ({ type: "init" } & Fresh)
  | ({ type: "run"; appKey: AppKey; email: string } & Fresh)
  | ({ type: "attack"; attack: AttackKey } & Fresh)
  | ({ type: "hub"; up: boolean } & Fresh)
  | ({ type: "org"; domain: string } & Fresh)
  | { type: "role"; spoke: AppKey; email: string }
  | { type: "go"; i: number }
  | { type: "tick" }
  | { type: "play"; on: boolean }
  | { type: "signout"; i: number }
  | { type: "loadMissions"; missions: Record<string, boolean> }

function rerun(s: State, fresh: Fresh, patch: Partial<State> = {}): State {
  const next = { ...s, ...patch }
  const flow = runFlow(next.world, { appKey: next.appKey, email: next.email, attack: next.attack }, { nowMs: fresh.now, seed: fresh.seed })
  return { ...next, flow, cur: 0, playing: false, recorded: false, lastDone: null }
}

function award(s: State, id: string): State {
  return s.missions[id] ? s : { ...s, missions: { ...s.missions, [id]: true }, lastDone: id }
}

function finish(s: State): State {
  const f = s.flow!
  const { appKey, email, attack } = f.input
  const domain = email.split("@")[1]
  let next = s
  if (f.ok && f.outcome) {
    const o = f.outcome
    const sessions = s.sessions.filter((x) => !(x.appKey === o.appKey && x.email === o.email))
    sessions.push({ appKey: o.appKey, email: o.email, name: o.name, org: o.org, roles: o.roles })
    next = { ...next, sessions }
    if (appKey === "a" && email === "alice@acme.com") next = award(next, "m1")
    if (email === "peter@initech.com" && s.initechFailedAtSpokeChanges !== null && s.initechFailedAtSpokeChanges === s.world.spokeChanges) next = award(next, "m3")
    if (email === "carol@acme.com") {
      const carol = { ...s.carol, [appKey]: true }
      next = { ...next, carol }
      if (carol.a && carol.b) next = award(next, "m4")
    }
    if (email === "bob@globex.com" && appKey === "a" && o.roles.includes("admin")) next = award(next, "m7")
    return next
  }
  const n = f.steps[f.failIndex].n
  if (n === 4) {
    next = award(next, "m2")
    if (domain === "initech.com") next = { ...next, initechFailedAtSpokeChanges: s.world.spokeChanges }
  }
  if (n === 3 && !s.world.hubUp && s.sessions.length > 0) next = award(next, "m5")
  if (attack !== "none" && ATTACKS[attack].step === n && !next.caught.includes(attack)) {
    const caught = [...next.caught, attack]
    next = { ...next, caught }
    if (REAL_ATTACKS.every((a) => caught.includes(a))) next = award(next, "m6")
  }
  return next
}

function goTo(s: State, i: number): State {
  const f = s.flow
  if (!f) return s
  const cur = Math.max(0, Math.min(f.steps.length - 1, i))
  let next: State = { ...s, cur, lastDone: null }
  if (cur >= f.finalIndex) {
    next = { ...next, playing: false }
    if (cur === f.finalIndex && !s.recorded) next = finish({ ...next, recorded: true })
  }
  return next
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "init":
      return rerun(s, a)
    case "run":
      return rerun(s, a, { appKey: a.appKey, email: a.email })
    case "attack":
      return rerun(s, a, { attack: a.attack })
    case "hub":
      return rerun(s, a, { world: { ...s.world, hubUp: a.up } })
    case "org":
      return rerun(s, a, {
        world: {
          ...s.world,
          registered: { ...s.world.registered, [a.domain]: !s.world.registered[a.domain] },
          hubChanges: s.world.hubChanges + 1,
        },
      })
    case "role": {
      const current = rolesFor(s.world, a.spoke, a.email).includes("admin")
      const forSpoke = { ...s.world.roles[a.spoke] }
      if (current) delete forSpoke[a.email]
      else forSpoke[a.email] = ["admin"]
      return { ...s, lastDone: null, world: { ...s.world, roles: { ...s.world.roles, [a.spoke]: forSpoke }, spokeChanges: s.world.spokeChanges + 1 } }
    }
    case "go":
      return goTo(s, a.i)
    case "tick":
      return s.playing ? goTo(s, s.cur + 1) : s
    case "play":
      return { ...s, playing: a.on }
    case "signout":
      return { ...s, sessions: s.sessions.filter((_, i) => i !== a.i) }
    case "loadMissions":
      return { ...s, missions: { ...a.missions, ...s.missions } }
  }
}

export const fresh = (): Fresh => ({ seed: Math.random().toString(36).slice(2, 10), now: Date.now() })
