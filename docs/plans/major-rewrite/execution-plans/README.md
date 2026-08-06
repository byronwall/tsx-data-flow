# Major Rewrite — Byronized Project Map

**Status:** Project 4 in progress; Project 3 complete
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

## Progress tracker

| Project | Status | Completed evidence | Remaining work |
| --- | --- | --- | --- |
| Project 1 — First proven route slice | Complete | Milestones 1–3B and the Project 1 product gate passed. The final proof has 19 nodes, 18 proven edges, and 0 gaps. | Refresh restoration remains assigned to Project 4. |
| Project 2 — Scope-neutral proof pack | Complete | Milestones 1–4 and their independent acceptance checks passed. The compact endpoint-indexed relation scan is implemented. | Representative Pluck-scale production use remains unproven. |
| Project 3 — Honest route totality | Complete | Backend Milestones 1–3, Milestone 4, the production browser gate, and the five-minute comprehension decision gate passed. No comprehension blocker remains. | None. Refresh restoration remains Project 4 work. |
| Project 4 — Route investigation workspace | In progress | Milestones 1–4 source gates passed. Milestone 5 repairs are implemented. The focused soccer HTTP gate and clean-room development-browser gate passed. | A frozen production-build browser gate remains if the plan requires it. Cold requests, payload size, source-picker density, and refresh restoration remain risks. |
| Project 5 — Route cutover and legacy removal | Blocked | No work pulled forward. | Blocked until Project 4 completes its remaining production and runtime requirements. |
| Projects 6–10 | Candidate | Planning artifacts only. | Reassess after the committed route sequence. |

Project 2 worker wave (completed):

| Worker | Ownership | Role |
| --- | --- | --- |
| 🧭 17 | `examples/solid-route/**` | Fixture implementation |
| 🧭 18 | `examples/node-cli/**` | Fixture implementation |
| 🧭 19 | Shared seam | Read-only shared-seam study |
| 🧭 29 | Milestone 2 independent verification | Acceptance PASS |
| 🧭 30 | Eager/lazy performance spike | Decision complete |

The first five fixture implementations are present: Solid route, Solid
full-stack route, Node CLI, HTTP service, and serverless handler. Each has a
README, handwritten evidence ledger, repeatable command, and fixture-scoped
static checks. All five independently verified PASS. Project 1 remains
complete. Its refresh restoration follow-up remains assigned to Project 4.

Project 2 status boundaries:

| Milestone or check | Status | Snapshot |
| --- | --- | --- |
| Milestone 1 — Implementation and independent verification | Complete | All five fixtures passed independent verification. Owners repaired Solid external-body overclaim/loading terminal, CLI citations/stderr/multiplicity, HTTP safe POST path/log terminal, shared field-role matrices, and the full-stack loading terminal. Fixture TypeScript/ESLint and safe commands passed. |
| Milestone 2 — Scope and slice seam | Complete | Independent acceptance PASS. Solid is 344/658/6/35/2 with no truncation. Node CLI is 364/743/14/7/77 with no truncation. Stable IDs have no route or scope IDs; duplicate IDs, invalid endpoints, and invalid proof are all 0. |
| Milestone 3 — CLI and service scopes | Complete | HTTP, serverless, Solid regression, and Node CLI final slices passed independent acceptance. |
| Milestone 4 — Exact full-stack bridge | Complete | Final full-stack CLI slice passed independent acceptance. |

Milestone 2 final independent acceptance passed the exact six-key schema,
stable source-based IDs with no route or scope IDs, duplicate IDs 0, invalid
relation endpoints 0, invalid proof 0, source-backed proof records, no
invented fetch or resource bridges, seed-only adapters,
direction/boundary/terminal/budget diagnostics, required origin and terminal
role distributions, and policy checks. `pnpm lint` and `pnpm typecheck` passed.

The repaired default Solid slice has 344 elements, 658 relations, 6 origins
(resource 2, fetch 2, network 2), 35 terminals (render 22, component 7), 2
external-code gaps, and no truncation. The repaired default CLI slice has 364
elements, 743 relations, 14 origins (argument 6, environment 4, filesystem 1,
cwd 3), 7 terminals (stdout 1, file-write 1, exit 1, side-effect 4), 77
honest gaps, and no truncation. Stderr is not stdout.

The repair adds environment, argv, stdin, exitCode, stderr, file IO, and
explicit external-response gaps. It adds exact parameter-role mapping,
deterministic role-distance priority, and runtime gap preservation. Adapter-local
defaults are bounded at `maxElements: 512` and `maxRelations: 1024`.

The prior acceptance run failed on missing roles, gap classification, and cap
coverage. Repair implementation and independent acceptance are now complete.
The eager Pluck collection has not returned successfully. Read-only prep
studies do not start Milestones 3–4. Tests, build, and verify were not run.

Milestone 2 performance decision:

- Use indexed facts with lazy relation expansion.
- Keep the current eager collector only as a small-fixture fallback.
- The current bounded query runs after full eager collection, so it does not
  solve Pluck scale.

| Workload | Measurement |
| --- | --- |
| Five fixtures | 0.80–0.91s wall; 267–391 elements; 426–775 relations; about 318–340 MiB end RSS. |
| Pluck TypeScript program load | 616 project files; 3,712 total files; 3.43s; about 1,010 MiB RSS. |
| Full Pluck evidence collection | Did not finish within 150s and was stopped. |
| Pluck store subset | 53 files; 25,036 elements; 48,851 relations; 68 gaps; 16.4s; about 1,660 MiB RSS. |
| Pluck viewer subset | 127 files; 38,881 elements; 79,220 relations; 56 gaps; 68.5s; at least 1,647 MiB heap. |
| Default bounded Solid and CLI slices | About 204–231KB and about 2ms after eager collection; both hit caps. |

The later Project 4 performance repair keeps compact facts eager. One
provider-local endpoint index now materializes selected relations lazily. It
replaces repeated overlapping relation partitions. Representative Pluck-scale
production use remains unproven.

Milestone 3 final independent acceptance passed:

| Scope | Elements | Relations | Origins | Terminals | Gaps | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| HTTP | 335 | 674 | 7 | 7 | 68 | No truncation or budget exhaustion |
| Serverless | 164 | 322 | 2 | 7 | 26 | No truncation or budget exhaustion |
| Solid regression | 344 | 658 | 6 | 35 | 2 | No truncation or budget exhaustion |
| Node CLI | 364 | 743 | 14 | 7 | 77 | No truncation or budget exhaustion |

The exact six-key schema, required role distributions, stable IDs,
registration and nested-entry proofs, adapter-only seeds and defaults, stderr
separation, and honest gaps passed. The repaired serverless ledger and EOF
whitespace follow-up are recorded. `pnpm lint`, `pnpm typecheck`, diff, and EOF
checks passed. Tests, builds, and verify were not run.

Milestone 4 final independent acceptance passed. The full-stack CLI slice has
269 elements, 491 relations, 9 origins, 23 terminals, and 1 gap, with the exact
six-key schema and no truncation or budget exhaustion.

The stable `RecordsPage` seed is `13zzlo3`, backed by
`program-element:14lb9j5` through the `solid-full-stack` adapter. The matched
records gap is removed. Telemetry remains the sole external gap.

Relation `program-relation:anvqd6` connects `server.ts:30 response.end(body)`
(`HTTP-response`) to `client.tsx:20 createResource` (`resource-input`). Proof
includes client fetch `client.tsx:5`, server normalization `server.ts:35–38`,
the GET/path guard `server.ts:40`, resolved handler declaration/call
`server.ts:24`/`:41`, response `server.ts:30`, and resource `client.tsx:20`.

The false-positive repair requires the handler request-origin parameter. Eight
negative variants returned zero bridges and honest external gaps. Scoped
whitespace and EOF checks passed. Tests, builds, and verify were not run.

## Project 3 status and kickoff audit

Project 3 is complete. Backend Milestones 1–3 passed independent acceptance.
Milestone 4 implementation, source-level UI gate, clean-room production
browser gate, and the five-minute comprehension decision gate passed. Project
4 is now in progress.

| Milestone or workstream | Status | Evidence or remaining work |
| --- | --- | --- |
| Milestone 1 — Occurrence kernel | Complete / independent PASS | Solid route: 7 definitions, 8 occurrences, 1 repeated, 5 conditional, 1 collection, 3 framework boundaries, 18 terminals, and 0 omissions. Pluck: 16 definitions and 54 occurrences with no truncation. |
| Milestone 2 — Provider, query, and route integration | Complete / independent PASS | All five fixture slices, stable IDs, all 21 relation kinds, and the full-stack bridge passed. The bounded query is provider-backed. |
| Milestone 3 — Route totality contract and API projection | Complete / independent PASS | The strict contract and the `route:1j5uvsv` API projection passed. |
| Compact provider correctness/performance | Complete / independent PASS | The exact 17-file scan has zero lines `>=160/240`, largest 563, and collector facade 88. Scoped ESLint and server TypeScript checks passed. |
| Milestone 4 — Frontend totality graph/model/UI | Complete / PASS | Workers 69–70 delivered the third Route totality renderer, deterministic model/layout, semantic graph, zoom-aware labels, pan/zoom/reset, inspector, omissions, and explicit null/unavailable/partial states. The source-level UI and clean-room production browser gates passed. |
| Production snapshot build | Complete / PASS | Generation 1 runs on the fixed non-watch server at `127.0.0.1:4323`, PID `79352`. `/healthz` returned 200. |
| Clean-room browser gate | Complete / PASS | Frozen non-watch server `http://127.0.0.1:4323`, generation 1. `/records` uses route `route:1j5uvsv` and trajectory `trajectory:49a871`. Totality is partial: occurrence `7/8/1/5/1/3/18/0` and evidence `344/658/6/35/2`. |
| Project 3 comprehension decision gate | Complete / PASS | An unfamiliar browser reviewer used no source walkthrough and found no comprehension blocker. |

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

The focused readability re-gate passed. The independent source-level UI gate
also passed after repairs. The model layout is deterministic and byte-
identical. It has 381 nodes: 6 origin, 8 occurrence, 3 boundary, 18 terminal,
2 gap, and 344 evidence element. It has 689 edges: 28 render, 658 data, and 3
boundary. It has 1 omission and 0 unresolved items.

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

## Project 4 status

Project 4 is in progress. The frozen-baseline audit is complete. Milestones 1–4
passed their focused source gates. Milestone 5 repairs are implemented. The
selected-route session builds one detail route on demand. The focused soccer
HTTP gate passed. The clean-room development-browser gate also passed. A frozen
production-build browser gate remains if the plan requires it.

| Milestone or workstream | Status | Evidence or remaining work |
| --- | --- | --- |
| Frozen-baseline audit | Complete | Current works and assigned gaps are recorded below. |
| Milestone 1 — Make selection explain evidence | Source implementation complete — independent source gate PASS; production browser pending | All five focused repairs passed. Scoped ESLint and the final repository `pnpm typecheck` passed. Frozen production-browser verification remains. |
| Milestone 2 — Add source and terminal investigation | In progress — repair re-gate PASS; production browser pending | Backward traversal reverses incoming proven origin → render bridges. Partial seeds remain frontier-only. Isolation stubs include hidden cross-layer bridge crossings. Static checks passed. |
| Milestone 3 — Put code beside the graph | In progress — full seam re-gate PASS; production runtime/browser pending | Analyzer ownership and extension filtering passed. The generation handoff passed. The frozen production runtime/browser gate remains pending. |
| Milestone 4 — Add quiet finding awareness | In progress — final repair re-gate PASS; production browser pending | The backend gate found 28/28 exact identity and span joins. Targets, bytes, counts, and bridges remained valid. Frozen production-browser verification remains. |
| Milestone 5 — Restore useful local investigation state | In progress — source/static PASS; development browser PASS; focused performance PASS; production browser pending | Scope and URL repairs passed. Stable workspace ownership prevents trajectory-only workspace reloads. The compact surface keeps detailed evidence behind explicit disclosure. |

Refresh restoration remains Project 4 work.

Earlier source and static checks passed. The old product gate failure remains
historical evidence. The later focused soccer HTTP gate passed. The later
clean-room development-browser gate also passed. A frozen production-build
browser gate remains unproven.

### Project 4 product gate — 2026-08-03

The tested URL was
`http://localhost:4324/?viz=trajectory&route=route%3A1j5uvsv&flow=trajectory%3A49a871&trajectoryMode=detail&routeKind=pages&routeSort=steps&view=context&trajectoryRenderer=totality&graphCamera=698.898%2C489.771%2C0.856`.

Source and static gates passed. No source work regressed. The fresh production
build loaded the correct renderer. The product/browser gate failed because the
default Route totality graph was excessively dense, the raw proof lattice was
unreadable, and zoom appeared to trigger Suspense/loading.

The required product direction is to reuse Current workspace's top-left to
bottom-right layout, edge routing, edge placement, and progressive zoom labels.
Route totality should augment that usable topology with progressive evidence
disclosure.

### Pluck-scale soccer-schedule investigation

The command was `pnpm dev -- --root ../soccer-schedule --port 4325`.

The initial request stayed active for 5m36s. It used 95–110% CPU and up to
2.45 GiB RSS. HTTP returned zero bytes with status 000. The backend was
computing. Health stayed responsive. The process was not deadlocked. The
`Rank and summarize findings` label hid expensive post-summary work. A second
Chrome request queued behind it.

Truthful progress, same-epoch workspace coalescing, and abort-aware response
handling are implemented. A patched bounded run showed route-data construction
explicitly and coalesced the second request, but it did not complete by 180s.
The analyzer reached 112% CPU and 3.09 GiB RSS.

The observability and coalescing scope passed. The soccer workspace now returns
HTTP 200 in 23.2–25.1s and about 1.1MB. Coalescing and truthful progress work.

A producer-filter attempt improved the soccer workspace to 18.096s, but the
selected and detail runs returned no bytes after 180.005s at about 3.16GB RSS.
The slice was fully rolled back. The producer filter is not retained.

An earlier dependency-batch cache OOMed at HTTP 500 after 97.7s and 4.25GB
RSS. It was fully removed. It is not implemented work.

At this stage, the route-data performance gate remained failed. The connector
profile recorded 18.180285s for the workspace. The `/` detail request returned
HTTP 000 after 90.011251s. CPU was 105.6–112.5%. RSS reached about
3,047,856–3,117,344 KB.

The completed `app/src/routes/index.tsx` partition had 12 files and 5,000 AST
units. Timings were nodes 27.157ms, locations 9.100ms/3178, JSX 8.531ms,
declarations 3.345ms, IDs 2.723ms, HTTP 1.778ms, refs 0.162ms, calls 0.158ms,
and sink 0.229ms. It produced 1,391 relations.

The failing frontier first stalled during deferred declarations after
`AppShell.tsx`. The reusable declaration catalog removed that repeated scan.
The later endpoint-indexed relation repair completed the focused performance
work. The catalog is no longer the next implementation step.

### Focused soccer performance repair — 2026-08-03

The frontend workspace resource key is stable. Trajectory URL changes do not
refetch or unmount the workspace. Detail loading stays inline. Abort cleanup,
retry, current-error display, and stale-error hiding passed.

One provider-local compact endpoint-indexed scan replaces overlapping relation
partitions. The Solid probe changed from 9 to 1 relation collections. File
visits changed from 35 to 10. Recipe checks changed from 58,814 to 1,316. Exact
`344/658/6/35/2` parity remains.

Truncated gap endpoints become `null` unless their element is emitted. Gap
evidence and counts remain unchanged. Reused physical `callSiteId` values are
valid across different parents. Validation still requires equal span, scope, and
definition identity.

Constructor collection now gives one identity to each `NewExpression`. This
includes `Date`, `Map`, `Error`, `Event`, and `PromiseRejectionEvent`.

The generation 1 HTTP gate passed with zero validation issues:

| Request | Time | Bytes |
| --- | ---: | ---: |
| Workspace | 19.737s | Not recorded |
| `/_internal/comps` | 13.646s | 21,347,246 |
| `/games` | 6.443s | 4,770,696 |
| `/` | 6.685s | 4,575,796 |
| `/login` | 9.811s | 2,694,714 |
| `/login` warm | 0.047s | 2,694,714 |

All requests returned HTTP 200. Peak RSS on a representative `/login` run
changed from 3,108,032 KiB to 2,635,168 KiB.

The clean-room development-browser gate passed. Workspace load took 29.46s.
`/games` took 25.82s. `/login` took 25.79s. `/` took 24.63s. No workspace
reload or stuck loading state occurred.

The route-switch queue repair also passed. Automatic page selection now chooses
the cheapest useful route. Soccer defaults to `/login`, not
`/_internal/comps`. Valid restored selections remain unchanged. Each route
detail request now has an explicit client ID. Browser abort sends
`POST /api/route-data/cancel` through the Vite proxy. The server sets a shared
atomic flag and stops active or queued worker work without clearing generation
caches. In the final browser sequence, `/_internal/comps` and `/games` both
reached `cancelled`. Neither later completed. `/games/[gameId]` and `/games`
then rendered. The workspace did not reload, and no persistent queued state or
stale error remained. A direct Vite proxy probe returned cancel HTTP 204,
abandoned route HTTP 499, and replacement HTTP 200.

The dynamic-route and camera follow-up passed. Solid route candidates now keep
bracket path syntax. `/games/[gameId]/live` matches its one proven candidate
instead of the incompatible `/games/:gameId/live` label. Its totality is
partial, with 9 origins, 333 occurrences, 133 boundaries, 237 terminals, 838
evidence relations, and 171 named gaps. The clean browser gate rendered 703
visible marks. Wheel zoom, both zoom buttons, and pan caused zero new
`GET /api/route-data` requests. They did not show a workspace or detail loader.
Camera-only URL writes now use silent history replacement. The camera remains
restorable from the URL without notifying the full application.

Cold browser work remains near 30 seconds. The internal payload is 21.35 MB.
The source picker remains dense. A frozen production-build browser gate remains
if the plan requires it. Project 4 is not complete.

### Reuse-first UI source/static re-review

The repair uses the Current workspace visual baseline. The compact default
surface has about 29 nodes and 31 edges. It keeps 352 evidence marks and 658
relations behind explicit evidence detail. It batches local camera commits and
supports pointer and keyboard selection across the full surface.

The source/static re-review passed after seven fixes: all evidence bridges, the
unanchored and route-global lane, full-layout isolation stubs, focus fallback,
path-aware bounds, 80px/96px evidence geometry, and honest coverage copy. The
graph is 288 lines or fewer. Focused modules are below 300 lines.

The selected-route session skips all-route totality and builds one detail route
on demand. Solid exact totals are unchanged. The focused HTTP and clean-room
development-browser gates passed. A frozen production-build browser gate
remains unproven.

### Project 4 frozen-baseline audit

Current works include topology hub selection and its inspector, origin
selection, `loadRecords` emphasis and fade, explicit isolation to 2 nodes, and
focus return from the trajectory dialog. The repository map shows finding
counts, boundary counts, and representative landmarks. Landmark rows expose
the exact file link shape `/file?path=<path>#L<line>`. The audit found no
refresh console errors. Route and flow URL query state remains preserved.

Gaps assigned to Project 4:

- No explicit clear button exists in the topology inspector.
- Clearing a selection moves focus to the body.
- Graph selection does not move focus to the selected graph item.
- Topology locations have no open-code link.
- `Inspect resource` only selects the resource.
- The topology view has no finding counts.
- The visible `Filter by loadRecords` control did not visibly change the view.
- Refresh loses transient map selection.
- History does not restore the dialog or selection. Back can leave the app.

The Milestone 3 full seam re-gate passed. Analyzer ownership and extension
filtering reject non-source contained files, such as `src/frontend/src/style.css`,
instead of accepting them as TypeScript. The inherited successful probe passed.
The generation handoff passed. The totality / workspace open-source hook is
active. Runtime and browser verification remain pending.

### Current Project 4 gate status

The Milestone 1 focused source re-gate passed all five repairs: explicit
origin-to-evidence edges, endpoint-backed gap edges with scoped inspector gap
display, an explicit gaps ledger, edge `:focus-visible` styling, and reset
identity based on generation plus semantic payload. The scoped ESLint check and
final repository `pnpm typecheck` passed after concurrent bridge work completed.
The source implementation is complete. Built browser verification remains.

The Milestone 2 repair re-gate passed. Backward traversal reverses incoming
proven origin → render bridges. Partial seeds remain frontier-only. Isolation
stubs include hidden cross-layer bridge crossings. Static checks passed. The
backend bridge schema still has stable typed endpoints, status, proof, locations,
and evidence paths. Solid route has 3 bridges: 1 proven origin → `ViewerCard`
occurrence bridge and 2 partial `ViewerCard` terminal → resource origin bridges.
Validation issues are 0. Output is byte-stable, and mutation rejection passed.

The Milestone 3 full seam re-gate passed. Analyzer ownership and extension
filtering reject non-source contained files, such as `src/frontend/src/style.css`,
instead of accepting them as TypeScript. The inherited successful probe passed.
The generation handoff passed. The totality / workspace open-source hook is
active. Runtime and browser verification remain pending.

The Milestone 4 backend finding-attachment independent gate passed. It found
28/28 exact TypeScript identity plus span joins, with 14 proven and 14 partial
attachments, valid targets, 3/3 file details, stable bytes, zero dangling
attachments, and unchanged counts and bridges. The frontend gate found that
exact evidence-slice terminal attachments had no graph node and the matcher
handled only `role: null`. The focused repair is implemented, and the final
independent frontend repair re-gate passed. Built browser verification remains.

The Milestone 5 core repairs are complete. They add scope and generation guards.
They preserve the valid flow-owning route and repository source filters. Graph
and URL updates are atomic. The stable workspace resource prevents
trajectory-only workspace requests. The focused soccer HTTP and clean-room
development-browser gates passed. A frozen production-build browser gate
remains unproven. Project 4 remains in progress.

Project 1 uses these status boundaries:

| Milestone or check | Status | Snapshot |
| --- | --- | --- |
| Milestone 1 — Structured backend slice | Complete | Success returns 15 nodes, 14 proven edges, and zero gaps. Failure gaps have valid endpoints. Non-target routes return null. Compiler-linked handoffs and truncation rules are enforced. |
| Milestone 2 — Experimental proof graph | Complete | Core browser verification passed on the built snapshot: 15 nodes, 14 proven edges, 0 gaps, the exact `readFile` to `CaptureStatsPanel` path, semantic node distinctions, node and edge proof inspection, pan, zoom, keyboard activation, and a useful legacy route. |
| Milestone 3A — Occurrence identity spike | Complete | The spike records 16 definitions and 54 occurrences. HStack line 39 owns `CaptureDebugPopover` and `Badge`; sibling line 35 owns `HardDrive` and `Text`. |
| Milestone 3B — Source integration | Complete | The final proof has 19 nodes, 18 proven edges, and 0 gaps. Exact `readFile` and terminal proof passed. Hidden HStack line 39 stays out of visible nodes, retains hidden-path evidence, reconnects `CaptureDebugPopover` and `Badge`, and leaves sibling line 35 with `HardDrive` and `Text` only. |
| Nested contract validation | Complete | Validation returned PASS for all seven dangling mutation classes. |
| Core production browser verification | Complete | Enter, Space, pointer activation, `aria-pressed`, visible focus, route persistence, and graph smoke passed. |
| Stale loading progress repair | Complete | The stale loading progress was fixed and production-verified PASS. |
| Production snapshot 3 | Complete | `pnpm build` passed. The production server ran at `http://127.0.0.1:4321`. |
| Server-side analysis and performance | Complete | Server-side analysis completed. The visible `296/614` state was stale client progress. Cached workspace and route-data responses were fast. |
| Tab traversal observation | Verification limitation | The browser harness did not observe Tab or Shift+Tab movement. Both controls are native enabled buttons with no negative `tabindex`. This is not a Project 1 blocker. |
| Investigation-state refresh restoration | Remaining | Refresh restored only the default overview. Modal, route, proof view, selection, and camera did not restore. Track this as Project 4 work, not as a Project 1 blocker. |
| Project 1 product gate | Complete | The path is useful, proof is stronger than the fallback, occurrence identity prevents sibling joins, and the records can seed Project 2. |

The completed implementation has passed lint and TypeScript checks. No tests
were run or changed. Snapshot 3 passed at `http://127.0.0.1:4321`. Refresh
restoration remains a Project 4 follow-up.

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
