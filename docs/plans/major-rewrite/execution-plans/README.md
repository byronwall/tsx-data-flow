# Major Rewrite — Byronized Project Map

**Status:** Initial hierarchy  
**Source artifact:** [Unified Flow Analysis Rewrite — Raw Plan](../20260802-unified-flow-analysis-rewrite-raw-plan.md)

The raw plan is now a fixed shaping artifact. This folder turns that scope into
an outcome-based project hierarchy.

Each project has its own initial Byronized task list. Before execution, review
that task list against the current code and split any milestone that no longer
forms a small, verifiable outcome.

## Desired outcome

Build one evidence-backed flow system that first explains routes and later
supports commands, APIs, handlers, types, findings, writes, and repository
orientation.

The first product must let a developer:

- open one route;
- see every proven origin and component occurrence;
- understand the total rendering surface and connectivity;
- select one origin and see only its proven paths;
- follow data to every proven terminal;
- inspect code and proof without losing graph context;
- see gaps instead of speculative connections.

## Working constraints

- Route analysis receives the strongest early product treatment.
- The evidence and slice model must not require a route.
- Component occurrences remain separate from component definitions.
- Generic UI contraction must preserve local child ownership.
- Current DTOs, URLs, and experimental views may be replaced.
- Static proof wins over plausible inference.
- Projects of 10,000 to 100,000 lines must remain practical.
- Product iteration uses `pnpm lint`, `pnpm typecheck`, and manual review.
- Automated test changes require separate user approval.

## Project hierarchy

| Order | Project | Outcome | Depends on | Commitment |
| --- | --- | --- | --- | --- |
| 1 | [First proven route slice](01-first-proven-route-slice.md) | One exact Pluck origin-to-terminal path appears in a visible experimental graph. | Raw plan | Committed |
| 2 | [Scope-neutral proof pack](02-scope-neutral-proof-pack.md) | The same evidence and slice contract explains a route, CLI, API, and handler. | Project 1 | Committed |
| 3 | [Honest route totality](03-honest-route-totality.md) | One route shows every proven origin, occurrence, boundary, and terminal without false joins. | Projects 1–2 | Committed |
| 4 | [Route investigation workspace](04-route-investigation-workspace.md) | A user can move from overview to source, path, code, and findings without losing context. | Project 3 | Committed |
| 5 | [Route cutover and legacy removal](05-route-cutover-and-legacy-removal.md) | The new route product replaces the conflicting route models and obsolete views. | Project 4 | Committed |
| 6 | [Type and field flow](06-type-and-field-flow.md) | A user can see how types and fields are selected, packed, renamed, and restored. | Project 5 | Candidate |
| 7 | [Finding impact on the graph](07-finding-impact-on-graph.md) | A selected finding reveals its cause and blast radius on proven paths. | Projects 5–6 as needed | Candidate |
| 8 | [Read, write, and reconcile](08-read-write-and-reconcile.md) | A value can be followed from persistence through interaction and back to authoritative state. | Project 5 | Candidate |
| 9 | [Application atlas](09-application-atlas.md) | A repository overview indexes routes, commands, endpoints, services, and major boundaries. | Projects 2 and 5 | Candidate |
| 10 | [Agent handoff and product hardening](10-agent-handoff-and-hardening.md) | A selected investigation becomes a bounded work packet, and the product has measured safety gates. | Projects 5–9 as selected | Candidate |

## Dependency view

```text
1. First proven route slice
  → 2. Scope-neutral proof pack
    → 3. Honest route totality
      → 4. Route investigation workspace
        → 5. Route cutover and legacy removal
          ├─ 6. Type and field flow
          ├─ 7. Finding impact on the graph
          ├─ 8. Read, write, and reconcile
          └─ 9. Application atlas

Selected mature capabilities
  → 10. Agent handoff and product hardening
```

## Project 1: First proven route slice

Put the marshmallow in the air. Show one exact `readFile` occurrence moving
through one Pluck route path to one terminal in a new experimental graph.

### Desired end state

- The new path is visible in the browser.
- Every visible edge has source proof.
- A missing handoff appears as a gap.
- The current broad resource fallback is not used.
- The old route view remains available during comparison.

## Project 2: Scope-neutral proof pack

Prove that the first slice did not create a route-only core. Add small route,
full-stack, CLI, API, and serverless examples. Run them through one evidence and
slice contract.

### Desired end state

- Every example has a discovered scope, origins, terminals, and gaps.
- Adapters provide seeds and defaults only.
- No adapter creates a private trajectory graph.
- Structured results use one shared vocabulary.

## Project 3: Honest route totality

Expand from one path to the full route surface. Add occurrence identity,
caller-owned slots, repeated call sites, all origins, and all terminals.

### Desired end state

- Every proven route occurrence has one honest render parent.
- Shared UI definitions do not join unrelated callers.
- Hidden wrappers reconnect their local children correctly.
- Counts separate definitions, occurrences, hidden wrappers, and terminals.
- Large graphs remain readable through projection instead of truncation.

## Project 4: Route investigation workspace

Turn the total route graph into the main investigation surface. Add source
selection, terminal tracing, isolation, zoom labels, code inspection, finding
markers, and refresh restoration.

### Desired end state

- A developer can explain route totality within five minutes.
- A developer can trace one origin to every proven terminal.
- Selection opens exact code and proof.
- Findings stay quiet until requested.
- Refresh returns to the same useful investigation state.

## Project 5: Route cutover and legacy removal

Make the new route workspace authoritative. Remove the old semantic membership,
broad fallbacks, definition-merged topology, evidence cards, and separate
component structure view.

### Desired end state

- One analyzer truth drives the route workspace.
- The `readFile` regression cannot occur through a fallback path.
- Obsolete route contracts and views are removed.
- Pluck and the example applications meet the agreed product checks.
- Performance remains near the current local baseline.

## Cut line

Projects 1–5 form the committed rewrite sequence.

Stop after Project 5 for a product review. Use the new route workspace on real
repositories before selecting the next major capability.

Projects 6–10 remain below the cut line. Their documents preserve the expected
outcomes and likely milestones. They are not commitments to execute in order.

## Rules for project execution

Before starting a project:

1. Re-read the raw plan and this project map.
2. Reinspect the current subsystem and worktree state.
3. Confirm that the first milestone is still the smallest visible proof.
4. Resolve any spike that changes identity, trust, scope, or migration rules.
5. Record explicit exclusions.
6. Define manual and static verification.
7. Ask for approval before adding or changing tests.
8. Stop at the project decision gate for product review.

Do not begin a later project merely because its supporting schema is convenient
to add. Pull later work forward only when the current milestone cannot produce
its desired end state without it.

