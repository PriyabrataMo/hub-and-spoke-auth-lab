# Auth Hub Playground

Interactive UI for learning hub-and-spoke identity federation. It is a browser-side simulation of the runnable Python lab in [`../auth-hub-lab`](../auth-hub-lab) (same layers, claims and checks), so no backend is needed.

Stack: Bun, Next.js 16 (App Router), Tailwind v4, shadcn/ui (`base-nova` style, Base UI primitives).

## Run

```bash
bun install
bun run dev        # http://localhost:3000
bun test           # engine + mission tests (20)
bun run build
```

## What is in it

| Tab | Purpose |
| --- | --- |
| Login lab | Pick an app and email, step through the 9-hop login, read each token with claims colored by who added them. Break things: hub offline, four attacks. Onboard customers in the hub, edit roles in the spokes, see sessions. 7 missions. |
| Concepts | Glossary: IdP, hub, spoke, organization, home realm discovery, claims, scope vs spoke, costs. |
| Why a hub? | Sliders showing N x M connections without a hub versus N + M with one. |
| Check yourself | 8-question quiz with explanations. |

## Layout

- `lib/engine.ts`: pure simulation (`runFlow`). Signatures use a toy hash so tampering is detectable; real systems use RS256 and JWKS.
- `lib/playground-state.ts`: reducer, sessions and mission rules. Time and randomness are passed in via actions to keep it pure.
- `lib/engine.test.ts`: tests mirroring `auth-hub-lab/tests/test_flow.py` plus mission paths.
- `components/playground/*`: UI. `components/ui/*`: shadcn components.

## Limits

Simulated tokens, not RSA. No PKCE, key rotation or logout propagation yet (lab milestones M6 to M8). Auth0-specific behavior such as how `login_hint` drives Home Realm Discovery is modeled, not verified.
