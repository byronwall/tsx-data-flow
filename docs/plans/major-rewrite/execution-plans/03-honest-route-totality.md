# Project 3 — Honest Route Totality

## Outcome

Show every proven source, component occurrence, boundary, and terminal for one
route without false joins or arbitrary branch removal.

This project turns the single-path marshmallow into the holistic route view.

## Current execution status

Status: Complete. Backend Milestones 1–3 passed independent acceptance.
Milestone 4 implementation, source-level UI gate, clean-room production
browser gate, and the five-minute comprehension decision gate passed. Project
4 is now in progress.

| Workstream | Status | Evidence or remaining work |
| --- | --- | --- |
| Read-only kickoff audits | Complete | Project 1, local occurrence, and legacy route baselines are recorded below. |
| Occurrence kernel | Complete / independent PASS | Solid route and Pluck occurrence totals passed with no omissions or truncation. |
| Provider, query, and route integration | Complete / independent PASS | All five fixture slices, stable IDs, all 21 relation kinds, and the full-stack bridge passed. |
| Strict route totality contract | Complete / independent PASS | Nullable, schema, coverage, mutation, and marker semantics passed. |
| API projection | Complete / independent PASS | `route:1j5uvsv` returned a byte-stable partial projection with zero validator issues. |
| Compact provider correctness/performance | Complete / independent PASS | The exact 17-file scan has zero lines `>=160/240`, largest 563, and collector facade 88. Scoped ESLint and server TypeScript checks passed. |
| Milestone 4 frontend graph/model/UI | Complete / PASS | Workers 69–70 delivered the third Route totality renderer, deterministic model/layout, semantic graph, zoom-aware labels, pan/zoom/reset, inspector, omissions, and explicit null/unavailable/partial states. The source-level UI and clean-room production browser gates passed. |
| Production snapshot build | Complete / PASS | Generation 1 runs on the fixed non-watch server at `127.0.0.1:4323`, PID `79352`. `/healthz` returned 200. |
| Clean-room browser gate | Complete / PASS | Frozen non-watch server `http://127.0.0.1:4323`, generation 1. `/records` uses route `route:1j5uvsv` and trajectory `trajectory:49a871`. Totality is partial: occurrence `7/8/1/5/1/3/18/0` and evidence `344/658/6/35/2`. |
| Project 3 comprehension decision gate | Complete / PASS | An unfamiliar browser reviewer used no source walkthrough and found no comprehension blocker. |
| Project 4 — Route investigation workspace | In progress | Milestone 1 implementation is active. Milestones 2–5 remain. |

### Kickoff audit baselines

| Baseline | Snapshot | Boundary |
| --- | --- | --- |
| Project 1 final proof | 19 nodes / 18 proven edges / 0 gaps | The proven route slice is the baseline for totality. |
| Local occurrence spike | 16 definitions / 54 occurrences | Occurrence identity is available for the kernel. |
| Legacy route | 261 rendered records / 771 definition edges | The legacy route does not preserve occurrence identity. |

The kickoff audit identified Milestone 1 gaps in the route-wide surface,
repetition markers, slot ownership, framework boundaries, honest totals, and
the static/runtime distinction.

The performance prerequisite is a lazy `ProgramFactIndex` and
`EvidenceRelationProvider` before Milestones 2 and 4. No full eager Pluck run
was completed. Known closure probe counts are candidates only, not proven
totals.

### Backend acceptance snapshot

The occurrence kernel passed independent acceptance. The Solid route has 7
definitions, 8 occurrences, 1 repeated, 5 conditional, 1 collection, 3
framework boundaries, 18 terminals, and 0 omissions. Pluck has 16 definitions
and 54 occurrences with no truncation.

Provider, query, and route integration passed for all five fixture slices. It
returned stable IDs, all 21 relation kinds, and the full-stack bridge. The
bounded query is provider-backed.

The compact Pluck zero-frontier run took 13.273s in the provider, 14.763s
wall-clock, and 1.774GB RSS. It produced 185,120 compact facts and hydrated
zero facts. The first endpoint expansion took 2.090s and reached 1.855GB RSS.

The strict route totality contract passed required nullable, exact six-key
evidence slice, origin coverage, and cycles, references, totals, omissions,
and proofs mutation cases. Proof-distinct records with the same endpoint and
kind are valid. Repeated and conditional marker semantics passed after repair.

The API projection passed for route `route:1j5uvsv` with status `partial`.
Its occurrence totals are 7 definitions, 8 occurrences, 1 repeated, 5
conditional, 1 collection, 3 framework boundaries, 18 terminals, and 0
omissions. Its evidence totals are 344 elements, 658 relations, 6 origins,
35 terminals, and 2 gaps. It returned 658 unique stable IDs, 6 origins, zero
validator issues, and byte-stable output. Lint and TypeScript checks passed.

The focused compact-provider readability re-gate passed. The exact 17-file
scan has zero lines `>=160/240`, largest 563, and collector facade 88. Scoped
ESLint and server TypeScript checks passed.

Milestone 4 frontend totality graph/model/UI implementation is complete with
workers 69–70. The independent source-level UI gate passed after repairs. The
model layout is deterministic and byte-identical. It has 381 nodes: 6 origin,
8 occurrence, 3 boundary, 18 terminal, 2 gap, and 344 evidence element. It has
689 edges: 28 render, 658 data, and 3 boundary. It has 1 omission and 0
unresolved items.

All model, layout, and JSX files are below 400 lines. The third Route totality
renderer, honest states, edge families, inspector, ledger, SSR safety,
selected `aria-pressed`, monospace route labels, and CSS semantics passed.
Writer lint, TypeScript, and the Impeccable detector passed.

The production snapshot build passed. Generation 1 runs on the fixed
non-watch server at `127.0.0.1:4323`, PID `79352`. `/healthz` returned 200.
The `/records` route is `route:1j5uvsv` with trajectory `trajectory:49a871`.
Totality is partial: occurrence `7/8/1/5/1/3/18/0` and evidence
`344/658/6/35/2`.

The clean-room production browser gate passed on frozen non-watch server
`http://127.0.0.1:4323`, generation 1. It reported no console errors or
warnings and no busy or stale-loading state. Visible navigation reached
`/records`, and all three renderers activated. Route totality passed pointer
and Enter activation with `aria-pressed=true`.

The graph showed 381 marks and 689 edges: 28 render, 658 data, and 3
boundary. Explicit partial coverage showed 6 origins, 8 occurrences, 3
framework boundaries, 18 terminals, and 2 gaps, with a named omission and
budget ledger.

Zoom, reset, wheel, pan, pointer node and edge selection, keyboard node
selection, inspectors, proof, and locations passed. Hard refresh reset to
Current workspace as expected for Project 4 refresh restoration scope. The
totality view recovered without error. At 900x700, controls, graph, inspector,
legend, and ledger remained usable.

The five-minute comprehension decision gate passed. An unfamiliar browser
reviewer used no source walkthrough and identified the origins
`loadRecords→records` and `loadViewer→viewer`.

The reviewer estimated `/records` at 40 paths, 7 connected components, 18
topology connections, 381 marks, and 689 edges. `RecordsRoute` was the hub
that fed `RouteFrame`, then `ViewerCard`, `RecordTable`, `RecordSummary`,
`MetricCard`, and `RecordRow` paths.

The explicit partial state showed 6 origins (2 fetch, 2 network, 2 resource),
3 named framework boundaries, 2 external-code gaps, an unknown `RecordRow`
occurrence, partial evidence elements, and budget `1,316/1,536`. No
comprehension blocker remains. Project 3 is complete.

Project 4 is now in progress. Milestone 1 implementation is active. Milestones
2–5 remain. Refresh restoration remains Project 4 work.

## Milestone 1: Build the complete occurrence surface

Expand one selected route from one path to every proven static render
occurrence.

- **Change 1 — Create route occurrence identity**
  - Key occurrences by definition, call site, parent occurrence, and scope.
  - Preserve conditional and collection repetition markers.
  - Link each occurrence back to its definition and code location.
- **Change 2 — Preserve slot ownership**
  - Distinguish caller-owned children from definition-owned children.
  - Carry `props.children` and equivalent slot relationships through wrappers.
  - Treat portals or framework ownership as explicit boundaries.
- **Change 3 — Report honest totals**
  - Separate definitions, occurrences, repeated sites, hidden wrappers, and
    terminals.
  - Keep static counts distinct from runtime counts.

### Desired end state

- Every visible occurrence has an inspectable call site.
- Every ordinary occurrence has one render parent.
- Shared definitions no longer join unrelated callers.
- Collection sites report repetition without inventing instance counts.
- Route totals have precise meanings.

## Milestone 2: Include all route origins and terminals

Use the shared slice query to gather the total proven route data surface.

- **Change 1 — Classify every proven origin occurrence**
  - Include filesystem, database, network, URL, environment, global state, and
    browser storage where supported.
  - Keep resource and context boundaries distinct from external origins.
- **Change 2 — Retain every proven branch**
  - Follow each origin through every supported route path.
  - Do not hide branches because they seem unimportant.
  - Create named gaps when a path loses identity or exceeds a budget.
- **Change 3 — Classify route terminals**
  - Include rendered text, attributes, styles, and meaningful component inputs.
  - Summarize native DOM detail when an explicit node adds little orientation.
- **Change 4 — Remove broad source matching from the new projection**
  - Require an exact occurrence path for source participation.
  - Keep resource ownership evidence separate from value lineage.

### Desired end state

- The route graph contains every supported proven origin and terminal.
- Source selection never depends on field overlap or a null consumer fallback.
- A resource may appear without claiming exact source lineage.
- Missing proof remains visible.

## Milestone 3: Contract generic UI occurrences locally

Hide layout wrappers without damaging the route hierarchy.

- **Change 1 — Define conservative transparency evidence**
  - Check child forwarding, data loading, context reads, domain transforms,
    important state, and render variants.
  - Allow known design-system families to seed the policy.
  - Keep folder and name signals insufficient on their own.
- **Change 2 — Splice hidden occurrences before any consolidation**
  - Reconnect each caller only to children from that wrapper occurrence.
  - Retain hidden occurrence IDs, locations, counts, and source participation.
- **Change 3 — Handle large repeated subtrees**
  - Keep repeated occurrence roots separate.
  - Collapse descendant detail with exact totals.
  - Add explicit actions for one occurrence, all occurrences, or shared
    definition inspection.
- **Change 4 — Expose projection diagnostics**
  - Show why an occurrence was hidden or retained.
  - Make local splice errors inspectable during product development.

### Desired end state

- `HStack`, `VStack`, `Grid`, and similar wrappers disappear when safe.
- Their local children reconnect to the correct caller.
- Hidden paths remain expandable and countable.
- Large reused components do not force false consolidation.

## Milestone 4: Make totality readable at route scale

Use layout and visual reduction to keep every proven branch available.

- **Change 1 — Render the component-first projection**
  - Keep origin, occurrence, boundary, terminal, and gap marks visible.
  - Keep render, data, and boundary edge families semantically distinct.
- **Change 2 — Add zoom-aware labels**
  - Preserve marks at low zoom.
  - Reveal names, counts, reuse, and boundary labels as space permits.
- **Change 3 — Preserve graph context during reduction**
  - Use fading, collapse, and local summaries.
  - Do not truncate branches or cap sources without a visible omission record.
- **Change 4 — Measure route scale**
  - Record analysis time, payload size, layout time, and visible node counts for
    Pluck and the examples.
  - Treat budget exhaustion as a gap.

### Desired end state

- The Pluck route presents its complete supported surface.
- A low-zoom view communicates route size and connectivity.
- Labels appear as the user approaches detail.
- The browser remains responsive on the selected large fixture.
- No invisible cap changes graph meaning.

## Project decision gate

Ask a developer unfamiliar with the selected route to inspect the graph for
five minutes.

Proceed only if the developer can explain:

- the major origins;
- the approximate route size;
- islands, hubs, or major chains;
- important runtime boundaries;
- where proof is incomplete.

## Below the cut line

- Rich code browsing
- Finding impact paths
- Type-first projection
- Runtime occurrence counts
- Automatic repeated-subtree consolidation
- Whole-repository atlas
- Automated tests without separate approval
