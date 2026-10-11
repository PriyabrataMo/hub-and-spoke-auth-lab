"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"

function Graph({ mode, customers, targets }: { mode: "mesh" | "star"; customers: number; targets: number }) {
  const vc = Math.min(customers, 6)
  const vt = Math.min(targets, 8)
  const H = 230
  const cy = (i: number, n: number) => (n === 1 ? H / 2 : 24 + i * ((H - 48) / (n - 1)))
  const label = mode === "mesh" ? "Every customer connected to every app environment" : "Customers and app environments each connected once to the hub"
  return (
    <svg viewBox="0 0 300 230" role="img" aria-label={label} className="block h-auto w-full">
      {mode === "mesh"
        ? Array.from({ length: vc }).flatMap((_, i) => Array.from({ length: vt }).map((__, j) => <line key={`${i}-${j}`} x1={40} y1={cy(i, vc)} x2={260} y2={cy(j, vt)} className="stroke-border" strokeWidth={1} />))
        : [
            ...Array.from({ length: vc }).map((_, i) => <line key={`c${i}`} x1={40} y1={cy(i, vc)} x2={150} y2={115} style={{ stroke: "var(--layer-hub)" }} strokeWidth={1.4} />),
            ...Array.from({ length: vt }).map((_, j) => <line key={`t${j}`} x1={150} y1={115} x2={260} y2={cy(j, vt)} style={{ stroke: "var(--layer-hub)" }} strokeWidth={1.4} />),
          ]}
      {mode === "star" && (
        <>
          <rect x={128} y={97} width={44} height={36} rx={8} style={{ stroke: "var(--layer-hub)", fill: "color-mix(in oklab, var(--layer-hub) 18%, var(--card))" }} strokeWidth={1.3} />
          <text x={150} y={119} textAnchor="middle" className="fill-foreground text-[10px] font-semibold">hub</text>
        </>
      )}
      {Array.from({ length: vc }).map((_, i) => <circle key={`n${i}`} cx={40} cy={cy(i, vc)} r={7} style={{ stroke: "var(--layer-idp)", fill: "color-mix(in oklab, var(--layer-idp) 18%, var(--card))" }} strokeWidth={1.3} />)}
      {Array.from({ length: vt }).map((_, j) => <circle key={`m${j}`} cx={260} cy={cy(j, vt)} r={7} style={{ stroke: "var(--layer-spoke)", fill: "color-mix(in oklab, var(--layer-spoke) 18%, var(--card))" }} strokeWidth={1.3} />)}
      <text x={4} y={H - 4} textAnchor="start" className="fill-muted-foreground text-[8px] font-semibold">customers{customers > vc ? ` (${vc} of ${customers})` : ""}</text>
      <text x={296} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[8px] font-semibold">app environments{targets > vt ? ` (${vt} of ${targets})` : ""}</text>
    </svg>
  )
}

function Param({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-2">
      <Label id={id}>{label}</Label>
      <div className="font-heading text-2xl font-bold tabular-nums">{value}</div>
      <Slider aria-labelledby={id} min={min} max={max} value={[value]} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)} />
    </div>
  )
}

export function HubTab() {
  const [C, setC] = useState(50)
  const [A, setA] = useState(3)
  const [E, setE] = useState(3)
  const T = A * E
  const mesh = C * T
  const star = C + T
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Count the connections</CardTitle>
          <CardDescription className="max-w-prose">Without a hub, every app environment holds its own connection to every customer. With a hub, each customer connects once and each app environment connects once. Move the sliders.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-6">
          <Param id="sl-c" label="Customers" value={C} min={1} max={200} onChange={setC} />
          <Param id="sl-a" label="Applications" value={A} min={1} max={8} onChange={setA} />
          <Param id="sl-e" label="Environments per app" value={E} min={1} max={4} onChange={setE} />
        </CardContent>
      </Card>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
        <Card>
          <CardHeader><CardTitle>Without a hub</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Graph mode="mesh" customers={C} targets={T} />
            <div className="font-heading text-4xl font-bold tabular-nums">{mesh.toLocaleString()}</div>
            <Progress value={100} className="[&_[data-slot=progress-indicator]]:bg-destructive" />
            <p className="text-sm text-muted-foreground">{C} customers × {T} app environments, each with its own secrets to rotate.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>With a hub</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <Graph mode="star" customers={C} targets={T} />
            <div className="font-heading text-4xl font-bold tabular-nums">{star.toLocaleString()}</div>
            <Progress value={Math.max(1, (star / mesh) * 100)} className="[&_[data-slot=progress-indicator]]:bg-layer-hub" />
            <p className="text-sm text-muted-foreground">{C} customer connections + {T} app environments, each connected once.</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Onboard one more customer</CardTitle>
          <CardDescription className="max-w-prose text-sm">
            Customer number {C + 1} signs up. Without a hub you change {T} tenant{T === 1 ? "" : "s"}. With a hub you change 1.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">The price: the hub becomes a single point of failure for every login. Try it in the Login lab by switching the hub off.</CardContent>
      </Card>
    </div>
  )
}
