"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { QUIZ } from "@/lib/content"
import { cn } from "@/lib/utils"

export function QuizTab() {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const right = QUIZ.filter((q, i) => answers[i] === q.a).length
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Check yourself</CardTitle>
        <div className="flex items-center gap-3">
          <span className="font-heading text-xl font-bold tabular-nums" aria-live="polite">{right} / {QUIZ.length}</span>
          <Button size="sm" variant="outline" onClick={() => setAnswers({})}>Start over</Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        {QUIZ.map((q, i) => {
          const picked = answers[i]
          const answered = picked !== undefined
          return (
            <div key={q.q} className="grid gap-2">
              {i > 0 && <Separator className="mb-3" />}
              <b>{i + 1}. {q.q}</b>
              {q.o.map((o, j) => (
                <Button
                  key={o}
                  variant="outline"
                  disabled={answered}
                  onClick={() => setAnswers((a) => ({ ...a, [i]: j }))}
                  className={cn(
                    "h-auto justify-start whitespace-normal py-2 text-left disabled:opacity-100",
                    answered && j === q.a && "border-success bg-success/10",
                    answered && j === picked && j !== q.a && "border-destructive bg-destructive/10",
                    answered && j !== q.a && j !== picked && "opacity-60",
                  )}
                >
                  {o}
                </Button>
              ))}
              {answered && <p className="text-sm text-muted-foreground"><b className={picked === q.a ? "text-success" : "text-destructive"}>{picked === q.a ? "Correct. " : "Not quite. "}</b>{q.w}</p>}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
