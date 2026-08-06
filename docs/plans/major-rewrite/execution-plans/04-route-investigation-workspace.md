# Project 4 — Route Investigation Workspace

## Outcome

Let a developer move from the holistic route overview to one source, path,
terminal, code region, or finding without losing graph context.

The graph remains the primary surface. Detail appears progressively.

## Current execution status

Status: In progress. Project 3 is complete. Milestones 1–4 passed their focused
source gates. Milestone 5 repairs are implemented. The focused soccer HTTP gate
passed. The clean-room development-browser gate also passed. A frozen
production-build browser gate remains if the plan requires it.

| Milestone | Status | Evidence or remaining work |
| --- | --- | --- |
| Frozen-baseline audit | Complete | Current works and assigned gaps are recorded below. |
| Milestone 1 — Make selection explain evidence | Source implementation complete — independent source gate PASS; production browser pending | All five focused repairs passed. Scoped ESLint and the final repository `pnpm typecheck` passed. Frozen production-browser verification remains. |
| Milestone 2 — Add source and terminal investigation | In progress — repair re-gate PASS; production browser pending | Backward traversal reverses incoming proven origin → render bridges. Partial seeds remain frontier-only. Isolation stubs include hidden cross-layer bridge crossings. Static checks passed. |
| Milestone 3 — Put code beside the graph | In progress — full seam re-gate PASS; production runtime/browser pending | Analyzer ownership and extension filtering passed. The generation handoff passed. The frozen production runtime/browser gate remains pending. |
| Milestone 4 — Add quiet finding awareness | In progress — final repair re-gate PASS; production browser pending | The backend gate found 28/28 exact identity and span joins. Targets, bytes, counts, and bridges remained valid. Frozen production-browser verification remains. |
| Milestone 5 — Restore useful local investigation state | In progress — source/static PASS; development browser PASS; focused performance PASS; production browser pending | Stable workspace ownership prevents trajectory-only workspace reloads. Scope and URL repairs passed. Detailed evidence remains behind explicit disclosure. |

Earlier source and static gates passed. The old product gate failure remains
historical evidence. The later focused soccer HTTP gate passed. The later
clean-room development-browser gate also passed. A frozen production-build
browser gate remains unproven.

### Project 4 product gate — 2026-08-03

The tested URL was
`http://localhost:4324/?viz=trajectory&route=route%3A1j5uvsv&flow=trajectory%3A49a871&trajectoryMode=detail&routeKind=pages&routeSort=steps&view=context&trajectoryRenderer=totality&graphCamera=698.898%2C489.771%2C0.856`.

The correct renderer loaded on a fresh production build. The gate failed because
the default Route totality graph was excessively dense, the raw proof lattice
was unreadable, and zoom appeared to trigger Suspense/loading.

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
if the plan requires it. Project 4 is not complete. Project 5 stays blocked.

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

### Frozen-baseline audit

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

## Milestone 1: Make selection explain evidence

Turn every visible graph item into an inspectable evidence target.

- **Change 1 — Unify selection identity**
  - Select origins, occurrences, boundaries, terminals, edges, hidden paths,
    gaps, and later operations through one selection contract.
  - Keep browser selection separate from analyzer identity.
- **Change 2 — Build the fixed inspector shell**
  - Show a concise summary, code locations, proof, incoming and outgoing
    neighbors, boundaries, and gaps.
  - Link occurrences to their shared definition and other call sites.
- **Change 3 — Preserve graph state**
  - Opening and closing the inspector must not remount or relayout the graph.
  - Return focus to the selected graph item when a transient surface closes.

### Desired end state

- Every visible mark and edge can explain why it exists.
- The inspector uses exact evidence from the slice DTO.
- Selection does not change graph meaning or layout.
- A user can move between an occurrence and its definition uses.

## Milestone 2: Add source and terminal investigation

Support focused questions while retaining the total route map.

- **Change 1 — Add exact source emphasis**
  - Emphasize only occurrence paths proven for the selected origin.
  - Fade unrelated route context without removing it.
  - Show field labels only when field identity is proven.
- **Change 2 — Add backward terminal emphasis**
  - Select a terminal to show every supported contributor.
  - Keep multiple origins and control inputs distinct.
- **Change 3 — Add explicit isolation**
  - Remove unrelated context only after the user asks.
  - Retain summarized incoming and outgoing boundary stubs.
  - Restore the full route without recomputing semantic evidence.

### Desired end state

- One origin reveals every proven route terminal it reaches.
- One terminal reveals every supported contributor.
- Fading and isolation have distinct behaviors.
- Gaps remain visible in focused views.

## Milestone 3: Put code beside the graph

Reuse the strongest part of the existing file-oriented product without making
files the investigation boundary.

- **Change 1 — Add exact code excerpts**
  - Show the selected source span with nearby context.
  - Navigate previous and next evidence within the current selection.
- **Change 2 — Support trace-oriented code grouping**
  - List related snippets across files in path order or evidence order.
  - Offer containing function and full-file expansion.
- **Change 3 — Preserve browser context**
  - Open code in the inspector, drawer, or a linked code-focused surface.
  - Return to the same graph selection and viewport.
- **Change 4 — Keep source transport bounded**
  - Fetch excerpts when needed.
  - Do not place full source text into the graph DTO or URL.

### Desired end state

- A selected graph fact opens the exact related code.
- Multi-file paths no longer require manual file rediscovery.
- Full-file inspection remains available.
- Graph state survives code inspection.

## Milestone 4: Add quiet finding awareness

Make findings available without turning them into the default graph subject.

- **Change 1 — Attach findings to evidence identities**
  - Link findings to occurrences, operations, edges, types, or code spans.
  - Avoid name-only matching.
- **Change 2 — Add restrained presence markers**
  - Use a ring, color cue, or count that works at useful zoom levels.
  - Keep the full finding list in the inspector.
- **Change 3 — Open existing finding detail**
  - Reuse current finding explanations and code evidence where sound.
  - Preserve graph selection when the user opens and closes detail.

### Desired end state

- Findings do not crowd the default graph.
- A user can tell when selected code has findings.
- Finding detail links back to exact graph evidence.
- No full impact-path feature is implied yet.

## Milestone 5: Restore useful local investigation state

Retain the main local view across refresh without preserving obsolete URL
contracts.

- **Change 1 — Define the small persistence set**
  - Keep scope, selection, projection, isolation, useful camera state, and
    explicit expansions.
  - Exclude temporary hover and open-menu state.
- **Change 2 — Reconcile state after analysis changes**
  - Retain the nearest valid scope.
  - Clear invalid descendants quietly.
  - Avoid a default-view flash before state restoration.
- **Change 3 — Keep navigation history useful**
  - Use replace behavior for ordinary inspection.
  - Use history entries only for meaningful scope changes.

### Desired end state

- Refresh returns to the same useful investigation.
- Source changes clear only invalid state.
- Old route URL compatibility does not constrain the model.
- Navigation does not fill browser history with selection noise.

## Project decision gate

Run a clean investigation on the Pluck route without a code walkthrough.

Proceed only if the user can:

- understand the overview;
- select one source;
- isolate a path;
- inspect exact code;
- find related findings;
- return to the full route;
- refresh without losing the main investigation.

## Below the cut line

- Inline code inside graph nodes
- Finding impact overlays
- Shared links
- Collaborative state
- Work packet export
- Type and field transform detail
- Automated tests without separate approval
