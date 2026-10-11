"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { APPS, ATTACKS, IDPS, ORG_DEFS, USERS, rolesFor, type AppKey, type AttackKey, type World } from "@/lib/engine"
import { MISSIONS, type Session } from "@/lib/playground-state"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

export function BreakThings({ hubUp, attack, onHub, onAttack }: { hubUp: boolean; attack: AttackKey; onHub: (up: boolean) => void; onAttack: (a: AttackKey) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Break things</CardTitle>
        <CardDescription>Switch the hub off to see what depends on it, or attack the login.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Label className="gap-3 font-semibold">
          <Switch checked={hubUp} onCheckedChange={onHub} />
          Hub is online
        </Label>
        <div className="grid gap-1">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Attack during the login</span>
          <RadioGroup value={attack} onValueChange={(v) => onAttack(v as AttackKey)}>
            {(Object.keys(ATTACKS) as AttackKey[]).map((k) => (
              <Label key={k} className="items-start gap-2 py-1.5 font-normal">
                <RadioGroupItem value={k} className="mt-0.5" />
                <span className="grid gap-0.5">
                  <span className="font-medium">{ATTACKS[k].label}</span>
                  <span className="text-xs text-muted-foreground">{ATTACKS[k].desc}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  )
}

export function OrgsCard({ world, onToggle }: { world: World; onToggle: (domain: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customers in the hub</CardTitle>
        <CardDescription>Onboarding or removing a customer only edits the hub. No spoke or app is touched.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ul className="grid divide-y">
          {ORG_DEFS.map((o) => {
            const on = world.registered[o.domain]
            return (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <div className="grid text-sm">
                  <span><b>{o.name}</b> <code className="font-mono text-xs text-muted-foreground">{o.domain}</code></span>
                  <span className={on ? "text-success" : "text-muted-foreground"}>{on ? `Registered with ${IDPS[o.idp].product}` : "Not onboarded"}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => onToggle(o.domain)}>{on ? "Remove" : "Onboard"}</Button>
              </li>
            )
          })}
        </ul>
        <div className="flex gap-6 text-sm">
          <span>Hub changes <b className="font-mono text-base">{world.hubChanges}</b></span>
          <span>Spoke changes <b className="font-mono text-base">{world.spokeChanges}</b></span>
        </div>
      </CardContent>
    </Card>
  )
}

export function RolesCard({ world, onToggle }: { world: World; onToggle: (spoke: AppKey, email: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles live in the spoke</CardTitle>
        <CardDescription>Roles are copied into the session at login. Change one, then log in again to see it. Each edit counts as a spoke change.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>App-A-Dev</TableHead>
              <TableHead>App-B-Prod</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.keys(USERS).map((e) => (
              <TableRow key={e}>
                <TableCell className="font-mono text-xs">{e}</TableCell>
                {(["a", "b"] as AppKey[]).map((k) => {
                  const admin = rolesFor(world, k, e).includes("admin")
                  return (
                    <TableCell key={k}>
                      <Button size="xs" variant="outline" aria-label={`${e} on ${APPS[k].label}: ${admin ? "admin" : "viewer"}. Toggle role.`} className={cn("w-16 rounded-full", admin && "border-layer-hub bg-layer-hub/15 text-layer-hub")} onClick={() => onToggle(k, e)}>
                        {admin ? "admin" : "viewer"}
                      </Button>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function SessionsCard({ sessions, hubUp, onSignOut }: { sessions: Session[]; hubUp: boolean; onSignOut: (i: number) => void }) {
  const [admin, setAdmin] = useState<Record<string, "200" | "403">>({})
  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in sessions</CardTitle>
        <CardDescription>Apps trust their own session cookie after login, not the token.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is signed in yet. Finish a login and the session appears here.</p>
        ) : (
          <ul className="grid divide-y">
            {sessions.map((s, i) => {
              const key = `${s.appKey}|${s.email}`
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="grid text-sm">
                    <span><b>{s.name}</b> on {APPS[s.appKey].label}</span>
                    <span className="text-xs text-muted-foreground">{s.org} · roles {s.roles.join(", ")}</span>
                    {admin[key] === "200" && <span className="text-xs text-success">200: admin page opened</span>}
                    {admin[key] === "403" && <span className="text-xs text-destructive">403: requires the admin role</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="outline" onClick={() => setAdmin((a) => ({ ...a, [key]: s.roles.includes("admin") ? "200" : "403" }))}>Open /admin</Button>
                    <Button size="xs" variant="ghost" onClick={() => onSignOut(i)}>Sign out</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!hubUp && sessions.length > 0 && <p className="text-sm text-success">The hub is offline and these people are still signed in. Apps trust their own session cookie.</p>}
      </CardContent>
    </Card>
  )
}

export function MissionsCard({ missions, caught, lastDone }: { missions: Record<string, boolean>; caught: number; lastDone: string | null }) {
  const doneCount = MISSIONS.filter((m) => missions[m.id]).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Missions</CardTitle>
        <CardDescription>{doneCount} of {MISSIONS.length} complete. A mission counts when its login finishes, so use Skip to end or step to the last step.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2">
          {MISSIONS.map((m) => {
            const done = !!missions[m.id]
            return (
              <li key={m.id} className={cn("grid grid-cols-[1.25rem_1fr] gap-2 rounded-md text-sm", lastDone === m.id && "bg-success/15")}>
                <span className={cn("mt-0.5 grid size-4 place-items-center rounded border", done ? "border-success bg-success text-background" : "border-input")}>{done && <Check className="size-3" />}</span>
                <span className={done ? "text-muted-foreground line-through" : undefined}>
                  {m.text}
                  {m.id === "m6" && !done && <Badge variant="outline" className="ml-2">{caught} of 4</Badge>}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
