"use client"

import { Card, CardContent } from "@/components/ui/card"
import { APPS, IDPS, ORG_DEFS, SPOKES, type Flow, type IdpKey, type NodeId, type World } from "@/lib/engine"
import { LAYER_STYLES } from "@/lib/content"

type Kind = "user" | "app" | "spoke" | "hub" | "idp"
const NODES: Record<NodeId, { x: number; y: number; w: number; h: number; kind: Kind }> = {
  user: { x: 90, y: 4, w: 180, h: 28, kind: "user" },
  app_a: { x: 20, y: 62, w: 150, h: 50, kind: "app" },
  app_b: { x: 190, y: 62, w: 150, h: 50, kind: "app" },
  spoke_a: { x: 20, y: 170, w: 150, h: 50, kind: "spoke" },
  spoke_b: { x: 190, y: 170, w: 150, h: 50, kind: "spoke" },
  hub: { x: 20, y: 278, w: 320, h: 50, kind: "hub" },
  idp_acme: { x: 20, y: 386, w: 100, h: 50, kind: "idp" },
  idp_globex: { x: 130, y: 386, w: 100, h: 50, kind: "idp" },
  idp_initech: { x: 240, y: 386, w: 100, h: 50, kind: "idp" },
}
const EDGES: [NodeId, NodeId][] = [
  ["user", "app_a"], ["user", "app_b"], ["app_a", "spoke_a"], ["app_b", "spoke_b"],
  ["spoke_a", "hub"], ["spoke_b", "hub"], ["hub", "idp_acme"], ["hub", "idp_globex"], ["hub", "idp_initech"],
]
const COLOR: Record<Kind, string> = {
  user: "var(--muted-foreground)",
  app: "var(--layer-app)",
  spoke: "var(--layer-spoke)",
  hub: "var(--layer-hub)",
  idp: "var(--layer-idp)",
}

function edgePoints(a: NodeId, b: NodeId, offset: boolean) {
  const A = NODES[a], B = NODES[b]
  const narrow = A.w <= B.w ? A : B
  const down = A.y < B.y
  const x = narrow.x + narrow.w / 2 + (offset ? (down ? 7 : -7) : 0)
  return { x1: x, y1: down ? A.y + A.h : A.y, x2: x, y2: down ? B.y : B.y + B.h }
}
const idpRegistered = (world: World, idp: IdpKey) => world.registered[ORG_DEFS.find((o) => o.idp === idp)!.domain]

function nodeText(id: NodeId, email: string, world: World): [string, string] {
  if (id === "user") return ["Browser", email]
  if (id.startsWith("app_")) return [APPS[id.slice(4) as "a" | "b"].label, "application"]
  if (id.startsWith("spoke_")) return [SPOKES[id.slice(6) as "a" | "b"].label, "spoke tenant"]
  if (id === "hub") return ["Central Auth Hub", "hub tenant: organizations and discovery"]
  const key = id.slice(4) as IdpKey
  return [IDPS[key].short, idpRegistered(world, key) ? IDPS[key].product : "not in hub"]
}

export function FlowDiagram({ flow, cur, world }: { flow: Flow; cur: number; world: World }) {
  const step = flow.steps[cur]
  const email = flow.input.email
  const markers = [
    ["trail", "color-mix(in oklab, var(--layer-hub) 55%, var(--card))"],
    ["active", "var(--layer-hub)"],
    ["bad", "var(--destructive)"],
  ]

  return (
    <Card>
      <CardContent>
        <svg viewBox="0 0 360 440" role="img" aria-label="Diagram of the four layers with the current login hop highlighted" className="mx-auto block h-auto w-full max-w-[460px]">
          <defs>
            {markers.map(([k, fill]) => (
              <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" style={{ fill }} />
              </marker>
            ))}
          </defs>

          {EDGES.map(([a, b]) => {
            const p = edgePoints(a, b, false)
            const off = b.startsWith("idp_") && !idpRegistered(world, b.slice(4) as IdpKey)
            return <line key={`${a}-${b}`} {...p} className="stroke-border" strokeWidth={1.5} strokeDasharray={off ? "3 4" : undefined} />
          })}

          {flow.steps.map((s, i) => {
            if (i > cur || s.status === "skipped" || !s.from || !s.to || s.from === s.to) return null
            const p = edgePoints(s.from, s.to, true)
            const isCur = i === cur
            const kind = isCur ? (s.status === "fail" ? "bad" : "active") : "trail"
            const stroke = kind === "bad" ? "var(--destructive)" : kind === "active" ? "var(--layer-hub)" : "color-mix(in oklab, var(--layer-hub) 55%, var(--card))"
            return <line key={`e${i}`} {...p} style={{ stroke }} strokeWidth={kind === "trail" ? 2 : 3} className={kind === "active" ? "flow-active" : undefined} markerEnd={`url(#ah-${kind})`} />
          })}

          {(Object.keys(NODES) as NodeId[]).map((id) => {
            const N = NODES[id]
            const [t1, t2] = nodeText(id, email, world)
            const hot = step.status !== "skipped" && (step.from === id || step.to === id)
            const bad = step.status === "fail" && step.to === id
            const off = N.kind === "idp" && t2 === "not in hub"
            const c = bad ? "var(--destructive)" : COLOR[N.kind]
            return (
              <g key={id} opacity={off ? 0.6 : 1}>
                <rect
                  x={N.x} y={N.y} width={N.w} height={N.h} rx={8}
                  style={{ stroke: c, fill: `color-mix(in oklab, ${c} ${hot || bad ? 24 : 10}%, var(--card))` }}
                  strokeWidth={hot || bad ? 3 : 1.3}
                  strokeDasharray={off ? "4 3" : undefined}
                />
                {N.kind === "user" ? (
                  <text x={N.x + N.w / 2} y={N.y + 18} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
                    {t1}
                    <tspan dx={6} className="fill-muted-foreground text-[10.5px] font-medium">{t2}</tspan>
                  </text>
                ) : (
                  <>
                    <text x={N.x + N.w / 2} y={N.y + 22} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">{t1}</text>
                    <text x={N.x + N.w / 2} y={N.y + 38} textAnchor="middle" className="fill-muted-foreground text-[10.5px]">{t2}</text>
                  </>
                )}
              </g>
            )
          })}

          {flow.steps.map((s, i) => {
            if (i > cur || s.status === "skipped" || !s.from || !s.to) return null
            const isCur = i === cur
            const isBad = s.status === "fail"
            let bx: number, by: number
            if (s.from === s.to) {
              const N = NODES[s.from]
              bx = N.x + N.w - 12
              by = N.y + 12
            } else {
              const p = edgePoints(s.from, s.to, true)
              bx = p.x1
              by = (p.y1 + p.y2) / 2
            }
            const fill = isCur ? (isBad ? "var(--destructive)" : "var(--layer-hub)") : "var(--card)"
            const stroke = isBad && isCur ? "var(--destructive)" : "var(--layer-hub)"
            return (
              <g key={`b${i}`}>
                <circle cx={bx} cy={by} r={9} style={{ fill, stroke }} strokeWidth={1.5} />
                <text x={bx} y={by} textAnchor="middle" dominantBaseline="central" className={`text-[10.5px] font-semibold ${isCur ? "fill-white" : "fill-foreground"}`}>{s.n}</text>
              </g>
            )
          })}
        </svg>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {([["app", "App"], ["spoke", "Spoke tenant"], ["hub", "Hub"], ["idp", "Customer IdP"]] as const).map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <i className={`inline-block size-2.5 rounded-[3px] ${LAYER_STYLES[k].dot}`} />
              {label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
