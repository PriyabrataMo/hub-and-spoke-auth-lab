import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { COSTS, CONCEPTS, LAYER_STYLES } from "@/lib/content"

export function ConceptsTab() {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-4">
        {CONCEPTS.map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {c.layer !== "none" && <i className={`inline-block size-2.5 rounded-[3px] ${LAYER_STYLES[c.layer].dot}`} aria-hidden />}
                {c.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground">{c.body}</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>What it costs</CardTitle>
          <CardDescription className="max-w-prose text-sm">{COSTS}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
