import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { LAYER_STYLES } from "@/lib/content"
import type { Origin, Token } from "@/lib/engine"
import { TriangleAlert } from "lucide-react"

const ORIGIN: Record<Origin, { label: string; cls: string }> = {
  idp: { label: "Customer IdP", cls: LAYER_STYLES.idp.chip },
  hub: { label: "Hub", cls: LAYER_STYLES.hub.chip },
  spoke: { label: "Spoke", cls: LAYER_STYLES.spoke.chip },
  env: { label: "Every hop", cls: "border-border bg-muted text-muted-foreground" },
  attacker: { label: "Attacker", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
}

export function TokenCard({ token, adds, now }: { token: Token; adds?: string[]; now: number }) {
  const [h, p, s] = token.raw.split(".")
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <b>{token.label}</b>
        <span className="text-muted-foreground">signed by {token.signer}</span>
      </div>
      {token.tampered && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>Edited after signing. The payload below is not what the issuer signed.</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableBody>
          {Object.entries(token.claims).map(([k, raw]) => {
            const v = k === "exp" ? `in ${Math.max(0, Math.round(((raw as number) - now) / 60))} min` : typeof raw === "string" ? raw : JSON.stringify(raw)
            const o = ORIGIN[token.origins[k] ?? "env"]
            return (
              <TableRow key={k}>
                <TableCell className="font-mono text-xs text-muted-foreground">{k}</TableCell>
                <TableCell className="font-mono text-xs break-all whitespace-normal">{v}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className={o.cls}>
                    {o.label}
                    {adds?.includes(k) ? " · new" : ""}
                  </Badge>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Accordion>
        <AccordionItem value="raw" className="border-0">
          <AccordionTrigger className="py-1 text-xs text-muted-foreground">Raw token</AccordionTrigger>
          <AccordionContent>
            <code className="block font-mono text-[11.5px] leading-relaxed break-all">
              <span className="text-layer-spoke">{h}</span>.<span className="text-layer-hub">{p}</span>.<span className="text-layer-idp">{s}</span>
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              The signature here is simulated with a hash so you can watch tampering fail. Real systems sign with an RSA private key and publish the public key at /jwks.json.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
