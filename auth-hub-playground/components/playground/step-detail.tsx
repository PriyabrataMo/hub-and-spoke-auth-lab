import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import type { Flow } from "@/lib/engine"
import { Check, CircleAlert, CircleDashed, Info, X } from "lucide-react"
import { TokenCard } from "./token-card"

function hint(n: number) {
  if (n === 3) return "Existing sessions are unaffected. Look at the sessions card: those people are still signed in."
  if (n === 4) return 'Open "Customers in the hub", onboard this customer, and run the login again. No spoke needs a change.'
  return null
}

export function StepDetail({ flow, cur }: { flow: Flow; cur: number }) {
  const s = flow.steps[cur]
  const isFinal = cur === flow.finalIndex
  const pill =
    s.status === "ok" ? <Badge variant="outline" className="border-success/40 text-success">Passed</Badge>
    : s.status === "fail" ? <Badge variant="destructive">Blocked</Badge>
    : <Badge variant="outline" className="text-muted-foreground">Not reached</Badge>

  return (
    <Card aria-live="polite">
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Step {s.n} of {flow.steps.length}</span>
          {pill}
        </div>
        <h2 className="font-heading text-xl font-semibold text-balance">{s.title}</h2>

        {s.status === "skipped" ? (
          <>
            <p className="text-muted-foreground">
              The login stopped at step {flow.steps[flow.failIndex].n} ({flow.steps[flow.failIndex].title}), so this step never ran.
            </p>
            {s.checks.length > 0 && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {s.checks.map((c) => <li key={c.text} className="flex gap-2"><CircleDashed className="mt-0.5 size-4 shrink-0" />{c.text}</li>)}
              </ul>
            )}
          </>
        ) : (
          <>
            <p>{s.what}</p>
            {s.params && (
              <Table>
                <TableBody>
                  {Object.entries(s.params).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{k}</TableCell>
                      <TableCell className="font-mono text-xs break-all whitespace-normal">{v}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {s.checks.length > 0 && (
              <div className="grid gap-1.5">
                <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Checked by {s.checker}</span>
                <ul className="grid gap-1 text-sm">
                  {s.checks.map((c) => (
                    <li key={c.text} className="flex gap-2">
                      {c.ok === true ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : c.ok === false ? <X className="mt-0.5 size-4 shrink-0 text-destructive" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                      <span className={c.ok === null ? "text-muted-foreground" : c.ok === false ? "font-semibold" : undefined}>{c.text}{c.ok === null ? " (not run)" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {s.fail && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>Blocked</AlertTitle>
                <AlertDescription>
                  {s.fail.reason}
                  {s.fail.why && <span className="mt-1 block text-muted-foreground">{s.fail.why}</span>}
                </AlertDescription>
              </Alert>
            )}
            {s.fail && isFinal && hint(s.n) && (
              <Alert><Info /><AlertDescription>{hint(s.n)}</AlertDescription></Alert>
            )}
            {s.token && <TokenCard token={s.token} adds={s.adds} now={flow.now} />}
            {s.status === "ok" && isFinal && flow.ok && flow.outcome && (
              <Alert>
                <Check />
                <AlertTitle>Signed in</AlertTitle>
                <AlertDescription>
                  {flow.outcome.name} from {flow.outcome.org} with roles <code className="font-mono text-xs">{flow.outcome.roles.join(", ")}</code>. Check the sessions card below, or run another login.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
