import { describe, expect, test } from "bun:test"
import { newWorld, runFlow, type AppKey, type AttackKey, type World } from "./engine"
import { initialState, reducer, type State } from "./playground-state"

const run = (world: World, email: string, appKey: AppKey = "a", attack: AttackKey = "none") =>
  runFlow(world, { appKey, email, attack }, { nowMs: 1_700_000_000_000, seed: "t" })

describe("login flow", () => {
  test("acme admin logs in on App A with org and roles", () => {
    const f = run(newWorld(), "alice@acme.com")
    expect(f.ok).toBe(true)
    expect(f.steps).toHaveLength(9)
    expect(f.outcome).toMatchObject({ org: "Acme Corp", roles: ["admin"] })
    expect(f.steps[5].token!.claims).not.toHaveProperty("org_id")
    expect(f.steps[6].token!.claims).toMatchObject({ org_id: "org_acme" })
    expect(f.steps[7].token!.claims).toMatchObject({ roles: ["admin"], aud: "app-a" })
  })

  test("globex user is a viewer", () => {
    expect(run(newWorld(), "bob@globex.com").outcome!.roles).toEqual(["viewer"])
  })

  test("roles differ per spoke", () => {
    const w = newWorld()
    expect(run(w, "carol@acme.com", "a").outcome!.roles).toEqual(["viewer"])
    expect(run(w, "carol@acme.com", "b").outcome!.roles).toEqual(["admin"])
  })

  test("unknown domain fails at step 4, later steps are skipped", () => {
    const f = run(newWorld(), "eve@unknown.io")
    expect(f.ok).toBe(false)
    expect(f.failIndex).toBe(3)
    expect(f.steps[4].status).toBe("skipped")
    expect(f.steps[3].fail!.reason).toContain("unknown.io")
  })

  test("onboarding initech fixes the login with zero spoke changes", () => {
    const w = newWorld()
    expect(run(w, "peter@initech.com").failIndex).toBe(3)
    w.registered["initech.com"] = true
    expect(run(w, "peter@initech.com").ok).toBe(true)
    expect(w.spokeChanges).toBe(0)
  })

  test("registered org but no IdP account fails at step 5", () => {
    expect(run(newWorld(), "ghost@acme.com").failIndex).toBe(4)
  })

  test("hub offline blocks at step 3", () => {
    const w = newWorld()
    w.hubUp = false
    const f = run(w, "alice@acme.com")
    expect(f.failIndex).toBe(2)
    expect(f.steps[2].fail!.reason).toContain("offline")
  })

  test.each([
    ["redirect_uri", 1],
    ["state", 7],
    ["audience", 7],
    ["tamper", 7],
  ] as const)("attack %s is caught at the expected step", (attack, idx) => {
    const f = run(newWorld(), "alice@acme.com", "a", attack)
    expect(f.ok).toBe(false)
    expect(f.failIndex).toBe(idx)
  })

  test("tamper fails on the signature, audience on aud", () => {
    expect(run(newWorld(), "alice@acme.com", "a", "tamper").steps[7].fail!.reason).toContain("Signature mismatch")
    expect(run(newWorld(), "alice@acme.com", "a", "audience").steps[7].fail!.reason).toContain("Audience")
  })

  test("same seed and clock give identical output", () => {
    expect(JSON.stringify(run(newWorld(), "alice@acme.com"))).toBe(JSON.stringify(run(newWorld(), "alice@acme.com")))
  })
})

describe("missions", () => {
  const fresh = (n: number) => ({ seed: `s${n}`, now: 1_700_000_000_000 })
  let n = 0
  const play = (s: State, appKey: AppKey, email: string) => {
    const r = reducer(s, { type: "run", appKey, email, ...fresh(n++) })
    return reducer(r, { type: "go", i: r.flow!.finalIndex })
  }
  const start = () => reducer(initialState, { type: "init", ...fresh(n++) })

  test("m1 alice on App A", () => expect(play(start(), "a", "alice@acme.com").missions.m1).toBe(true))

  test("m3 needs the initech failure, a hub-only fix, then success", () => {
    let s = play(start(), "a", "peter@initech.com")
    expect(s.missions.m2).toBe(true)
    s = reducer(s, { type: "org", domain: "initech.com", ...fresh(n++) })
    s = play(s, "a", "peter@initech.com")
    expect(s.missions.m3).toBe(true)
    expect(s.world.spokeChanges).toBe(0)
  })

  test("m3 is not awarded if a spoke role was edited in between", () => {
    let s = play(start(), "a", "peter@initech.com")
    s = reducer(s, { type: "role", spoke: "a", email: "bob@globex.com" })
    s = reducer(s, { type: "org", domain: "initech.com", ...fresh(n++) })
    expect(play(s, "a", "peter@initech.com").missions.m3).toBeUndefined()
  })

  test("m5 needs an existing session then a hub-down failure", () => {
    let s = play(start(), "a", "alice@acme.com")
    s = reducer(s, { type: "hub", up: false, ...fresh(n++) })
    s = reducer(s, { type: "go", i: s.flow!.finalIndex })
    expect(s.missions.m5).toBe(true)
    expect(s.sessions).toHaveLength(1)
  })

  test("m6 requires all four attacks", () => {
    let s = start()
    for (const attack of ["redirect_uri", "state", "audience", "tamper"] as const) {
      expect(s.missions.m6).toBeUndefined()
      s = reducer(s, { type: "attack", attack, ...fresh(n++) })
      s = reducer(s, { type: "go", i: s.flow!.finalIndex })
    }
    expect(s.missions.m6).toBe(true)
  })

  test("m7 bob admin on App A", () => {
    let s = start()
    s = reducer(s, { type: "role", spoke: "a", email: "bob@globex.com" })
    expect(play(s, "a", "bob@globex.com").missions.m7).toBe(true)
  })

  test("stepping short of the end records nothing", () => {
    const s = reducer(start(), { type: "go", i: 3 })
    expect(s.sessions).toHaveLength(0)
  })
})
