"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Flow } from "@/lib/engine"
import { Check, Minus, Pause, Play, SkipForward, StepBack, StepForward, X } from "lucide-react"

export function StepsPanel({ flow, cur, playing, onGo, onPlay }: { flow: Flow; cur: number; playing: boolean; onGo: (i: number) => void; onPlay: (on: boolean) => void }) {
  const atEnd = cur >= flow.finalIndex
  return (
    <Card>
      <CardHeader>
        <CardTitle>The login, step by step</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <ol className="grid gap-0.5">
          {flow.steps.map((s, i) => (
            <li key={s.n}>
              <button
                type="button"
                onClick={() => onGo(i)}
                aria-current={i === cur ? "step" : undefined}
                className={cn(
                  "grid w-full grid-cols-[1.75rem_1fr_1.25rem] items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  i === cur && "border-layer-hub bg-muted",
                  s.status === "skipped" && "text-muted-foreground",
                )}
              >
                <span className="text-center font-mono text-xs text-muted-foreground">{s.n}</span>
                <span>{s.title}</span>
                {s.status === "ok" ? <Check className="size-4 text-success" aria-label="passed" /> : s.status === "fail" ? <X className="size-4 text-destructive" aria-label="blocked" /> : <Minus className="size-4 text-muted-foreground" aria-label="not reached" />}
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onGo(cur - 1)} disabled={cur === 0}><StepBack data-icon="inline-start" />Back</Button>
          <Button onClick={() => onGo(cur + 1)} disabled={atEnd}><StepForward data-icon="inline-start" />Next step</Button>
          <Button variant="outline" onClick={() => onPlay(!playing)} disabled={atEnd && !playing}>
            {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" onClick={() => onGo(flow.finalIndex)} disabled={atEnd}><SkipForward data-icon="inline-start" />Skip to end</Button>
        </div>
      </CardContent>
    </Card>
  )
}
