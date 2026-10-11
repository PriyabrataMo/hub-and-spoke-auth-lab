"use client"

import { useEffect, useReducer } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { fresh, initialState, reducer } from "@/lib/playground-state"
import { ConceptsTab } from "./concepts-tab"
import { FlowDiagram } from "./flow-diagram"
import { HubTab } from "./hub-tab"
import { BreakThings, MissionsCard, OrgsCard, RolesCard, SessionsCard } from "./lab-cards"
import { QuizTab } from "./quiz-tab"
import { RunBar } from "./run-bar"
import { StepDetail } from "./step-detail"
import { StepsPanel } from "./steps-panel"
import { ThemeToggle } from "./theme-toggle"

const MISSION_KEY = "authplay.missions"

export function Playground() {
  const [s, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    dispatch({ type: "init", ...fresh() })
    try {
      const saved = JSON.parse(localStorage.getItem(MISSION_KEY) ?? "{}")
      if (saved && typeof saved === "object") dispatch({ type: "loadMissions", missions: saved })
    } catch {}
  }, [])

  useEffect(() => {
    try { localStorage.setItem(MISSION_KEY, JSON.stringify(s.missions)) } catch {}
  }, [s.missions])

  useEffect(() => {
    if (!s.playing) return
    const t = setInterval(() => dispatch({ type: "tick" }), 1500)
    return () => clearInterval(t)
  }, [s.playing])

  const flow = s.flow

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-14">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Auth Hub Playground</h1>
          <p className="max-w-[68ch] text-muted-foreground">
            Log in through four layers: the app, its spoke tenant, the central hub, and your company&apos;s identity provider. Step through each hop, read the tokens, then break things on purpose.
          </p>
          <p className="text-xs text-muted-foreground">A browser-side simulation of the runnable Python lab in auth-hub-lab. Tokens are signed with a toy hash, not real RSA.</p>
        </div>
        <ThemeToggle />
      </header>

      <Tabs defaultValue="lab">
        <TabsList variant="line" className="h-auto flex-wrap justify-start">
          <TabsTrigger value="lab" className="flex-none px-3 py-2">Login lab</TabsTrigger>
          <TabsTrigger value="concepts" className="flex-none px-3 py-2">Concepts</TabsTrigger>
          <TabsTrigger value="hub" className="flex-none px-3 py-2">Why a hub?</TabsTrigger>
          <TabsTrigger value="quiz" className="flex-none px-3 py-2">Check yourself</TabsTrigger>
        </TabsList>

        <TabsContent value="lab" className="mt-2 grid gap-4">
          <RunBar appKey={s.appKey} email={s.email} onRun={(appKey, email) => dispatch({ type: "run", appKey, email, ...fresh() })} />
          {flow && (
            <>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
                <FlowDiagram flow={flow} cur={s.cur} world={s.world} />
                <div className="grid min-w-0 gap-4">
                  <StepsPanel flow={flow} cur={s.cur} playing={s.playing} onGo={(i) => dispatch({ type: "go", i })} onPlay={(on) => dispatch({ type: "play", on })} />
                  <StepDetail flow={flow} cur={s.cur} />
                </div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] items-start gap-4">
                <MissionsCard missions={s.missions} caught={s.caught.length} lastDone={s.lastDone} />
                <BreakThings hubUp={s.world.hubUp} attack={s.attack} onHub={(up) => dispatch({ type: "hub", up, ...fresh() })} onAttack={(attack) => dispatch({ type: "attack", attack, ...fresh() })} />
                <OrgsCard world={s.world} onToggle={(domain) => dispatch({ type: "org", domain, ...fresh() })} />
                <RolesCard world={s.world} onToggle={(spoke, email) => dispatch({ type: "role", spoke, email })} />
                <SessionsCard sessions={s.sessions} hubUp={s.world.hubUp} onSignOut={(i) => dispatch({ type: "signout", i })} />
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="concepts" className="mt-2"><ConceptsTab /></TabsContent>
        <TabsContent value="hub" className="mt-2"><HubTab /></TabsContent>
        <TabsContent value="quiz" className="mt-2"><QuizTab /></TabsContent>
      </Tabs>
    </div>
  )
}
