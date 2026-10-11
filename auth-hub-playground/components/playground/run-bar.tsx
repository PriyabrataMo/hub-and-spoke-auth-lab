"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PRESET_EMAILS } from "@/lib/content"
import type { AppKey } from "@/lib/engine"
import { LogIn } from "lucide-react"

const APP_ITEMS = [
  { value: "a", label: "App A (trusts App-A-Dev)" },
  { value: "b", label: "App B (trusts App-B-Prod)" },
]
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

export function RunBar({ appKey, email, onRun }: { appKey: AppKey; email: string; onRun: (appKey: AppKey, email: string) => void }) {
  const [draft, setDraft] = useState(email)
  const [app, setApp] = useState<AppKey>(appKey)
  const [error, setError] = useState("")

  const submit = (a: AppKey, e: string) => {
    const clean = e.trim().toLowerCase()
    if (!validEmail(clean)) {
      setError("Enter a full work email such as alice@acme.com.")
      return
    }
    setError("")
    setDraft(clean)
    onRun(a, clean)
  }

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-wrap items-end gap-3"
          autoComplete="off"
          onSubmit={(ev) => {
            ev.preventDefault()
            submit(app, draft)
          }}
        >
          <div className="grid gap-1.5">
            <Label>Application</Label>
            <Select
              items={APP_ITEMS}
              value={app}
              onValueChange={(v) => {
                if (!v) return
                setApp(v as AppKey)
                submit(v as AppKey, draft)
              }}
            >
              <SelectTrigger className="w-60" aria-label="Application"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {APP_ITEMS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid min-w-56 flex-1 gap-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} aria-invalid={error ? true : undefined} />
          </div>
          <Button type="submit"><LogIn data-icon="inline-start" />Run login</Button>
          <div className="flex w-full flex-wrap items-center gap-1.5" aria-label="Example emails">
            <span className="text-xs text-muted-foreground">Try:</span>
            {PRESET_EMAILS.map((p) => (
              <Button key={p} type="button" variant="outline" size="xs" className="rounded-full font-mono" onClick={() => { setDraft(p); submit(app, p) }}>{p}</Button>
            ))}
          </div>
          <p className="min-h-4 w-full text-sm text-destructive" role="alert">{error}</p>
        </form>
      </CardContent>
    </Card>
  )
}
