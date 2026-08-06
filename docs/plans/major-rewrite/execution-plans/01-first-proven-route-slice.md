# Project 1 — First Proven Route Slice

## Outcome

Show one exact Pluck `readFile` occurrence moving through one route path to one
render terminal in a new experimental graph.

This is the first marshmallow. It proves the new evidence path end to end before
the rewrite supports full route breadth, other frameworks, or rich interaction.

## Known starting surfaces

- `src/analysis/graph.ts` and `src/analysis/source-trace.ts` hold the strongest
  general trace evidence.
- `src/analysis/route-data-trajectories.ts` builds exhaustive route paths.
- `src/analysis/route-data.ts` builds a separate semantic operation trajectory.
- `src/api/projections/route-data.ts` currently combines these models.
- `RouteTrajectoryWorkspace.tsx` and `ComponentTopologyGraph.tsx` host the
  current experiment.
- `topology-source-lens.ts` contains the broad source fallback that must not
  define the new path.

## Milestone 1: Show one exact path as structured evidence

Build the smallest shadow slice for the selected Pluck route, one concrete
`readFile` call, and one known render terminal. Do not build the full new graph
contract first.

- **Change 1 — Select one concrete source occurrence**
  - Identify the call by source location and compiler identity.
  - Keep the source definition separate from the call occurrence.
  - Reject a source that has no exact route path.
  - Verify the occurrence against the Pluck migration or capture-read code.
- **Change 2 — Retain one proven origin-to-terminal chain**
  - Reuse current graph and exhaustive-path evidence where it is sound.
  - Retain every edge's proof and source location.
  - Emit an explicit gap when the chain cannot cross a handoff.
- **Change 3 — Expose bounded shadow output**
  - Add a temporary structured projection beside the current route DTO.
  - Keep the payload limited to the selected route, origin, and terminal.
  - Inspect the output directly before adding browser rendering.

### Desired end state

- One exact `readFile` call has a stable occurrence identity.
- One proven chain reaches one known Pluck terminal.
- Every relationship has inspectable source evidence.
- Missing proof appears as a named gap.
- No resource or field-name fallback fills the gap.
- `pnpm lint` and `pnpm typecheck` pass.

## Milestone 1 execution status

Status: Complete for the selected structured shadow slice. The backend now
enforces the bounded proof contract.

| Item | Status | Evidence |
| --- | --- | --- |
| Select one exact source occurrence | Complete | `src/analysis/route-shadow-evidence.ts` selects `app/src/lib/pluck/store/json.ts:20` by location, `node:fs/promises`, and compiler identity `"fs/promises".readFile`. Definition and occurrence records stay separate. |
| Retain one proven origin-to-terminal chain | Complete | `src/analysis/route-shadow-evidence-compiler.ts` emits 15 nodes and 14 bounded edges from `readFile` to `CaptureStatsPanel.tsx:41`. The selected Pluck success run returned `status: proven` and zero gaps. |
| Expose bounded output beside the route DTO | Complete | `src/api/contracts.ts` validates `shadowEvidence`; `src/api/projections/route-data.ts` exposes it on the selected route detail. Compiler-linked handoffs, partial/truncation behavior, endpoint-valid inverse failure gaps, and null non-target routes are enforced. |
| Inspect structured output and repair integrity | Complete | Direct backend inspection returned the selected route, origin, terminal, 15 nodes, 14 edges, and zero gaps. Independent backend checks passed after repairs. |
| Milestone 2 browser graph | Complete for core verification | The visible graph and proof inspector passed the core production browser check on the built snapshot. The broader investigation-state checklist remains Project 4 work. |

Static checks passed: `pnpm lint` and `pnpm typecheck`. No tests were run or
changed. The Node definition has no repository source location; its module and
compiler identity remain explicit beside the exact repository occurrence.

## Milestone 2: Put the path into a visible experimental graph

Render the shadow slice in the current trajectory workspace behind an explicit
experimental choice. Preserve the old view for comparison.

- **Change 1 — Add a minimal semantic DTO**
  - Include origin, component occurrence, boundary, terminal, edge, and gap.
  - Avoid operation cards and full type shapes.
  - Validate the server and browser payload through the API contract boundary.
- **Change 2 — Render a fixed small graph**
  - Use existing pan, zoom, and label behavior where practical.
  - Draw only the selected exact path.
  - Use distinct marks for origin, component occurrence, boundary, and terminal.
- **Change 3 — Add a proof inspector**
  - Select a node or edge to show its code location and proof kind.
  - Show the gap reason when a connection stops.
  - Keep evidence cards out of this experiment.
- **Change 4 — Manually compare old and new behavior**
  - Open the reported Pluck URL.
  - Confirm that `readFile` appears in the graph and not only in the inspector.
  - Confirm that unrelated resources remain unhighlighted.

### Desired end state

- The browser shows one trustworthy origin-to-terminal path.
- Selecting any visible item shows why it exists.
- The old and new views can be compared without shared state corruption.
- The new view makes unsupported handoffs visible.
- No speculative connection appears.

## Milestone 2 execution status

Status: Complete for core implementation and production browser verification on
the built snapshot. The broad investigation-state checklist remains Project 4
work.

| Item | Status | Evidence |
| --- | --- | --- |
| Explicit renderer choices | Complete | The workspace exposes `Current workspace` and `Experimental proof graph` choices. Legacy state stays isolated from the experimental renderer. |
| Semantic graph and camera controls | Complete | The production snapshot showed 15 nodes, 14 proven edges, 0 gaps, semantic origin, component occurrence, boundary, and terminal distinctions, plus pan and zoom. |
| Proof inspector and keyboard activation | Complete | Node and edge proof inspection passed. Enter, Space, pointer activation, `aria-pressed`, visible focus, route persistence, and graph smoke passed. |
| Legacy comparison | Complete | The legacy route remained useful during the production browser check. |
| Core production browser verification | Complete | The exact `readFile` to `CaptureStatsPanel` path appeared in the graph. The core browser checklist passed on the built snapshot. |
| Server-side analysis and performance | Complete | Server-side analysis completed. The visible `296/614` state was stale client progress. Cached workspace and route-data responses were fast. |
| Investigation-state refresh restoration | Remaining | Refresh restored only the default overview. Modal, route, proof view, selection, and camera did not restore. Track these as later Project 4 investigation-state work, not as a Project 1 blocker. |
| Stale loading progress repair | Complete | Stale loading progress was fixed and production-verified PASS. |

### Production snapshot 3

`pnpm build` passed for Snapshot 3. The production server ran at
`http://127.0.0.1:4321`. This is the final production evidence recorded for
Project 1. Do not extend the core browser PASS to the broad browser checklist.

## Milestone 3: Prove one occurrence-safe UI handoff

Add the minimum occurrence identity needed to prevent a shared generic UI
definition from joining unrelated callers on the selected path.

- **Change 1 — Separate definition and call-site identity**
  - Record the selected component call site and its parent occurrence.
  - Link the occurrence back to its shared component definition.
- **Change 2 — Splice one transparent wrapper locally**
  - Use one real `HStack`, `VStack`, `Grid`, or equivalent Pluck occurrence.
  - Reattach only that occurrence's caller-owned children.
  - Preserve the wrapper in hidden-path evidence.
- **Change 3 — Check sibling isolation**
  - Confirm that another use of the same wrapper does not gain the selected
    occurrence's children or source path.

### Desired end state

- The visible path uses component occurrences.
- One hidden wrapper reconnects its local child correctly.
- Shared definition reuse remains inspectable.
- Unrelated caller branches remain separate.

## Milestone 3 execution status

| Slice | Status | Evidence |
| --- | --- | --- |
| Milestone 3A — Occurrence identity and wrapper projection | Complete | `src/analysis/component-occurrence-identity.ts` and `src/analysis/transparent-wrapper-occurrence-projection.ts` contain the spike. HStack line 39 owns `CaptureDebugPopover` and `Badge`; sibling line 35 owns `HardDrive` and `Text`. The result contains 16 definitions and 54 occurrences. Lint and TypeScript checks passed. |
| Milestone 3B — Source integration | Complete | The final proof has 19 nodes, 18 proven edges, and 0 gaps. Exact `readFile` and terminal proof passed. Hidden HStack line 39 stays out of visible nodes and retains hidden-path evidence. `CaptureDebugPopover` and `Badge` reconnect. Sibling line 35 retains `HardDrive` and `Text` only. |
| Nested contract validation | Complete | Validation returned PASS for all seven dangling mutation classes. |

No tests were run or changed.

## Project decision gate

Status: Complete. The Project 1 product gate passes.

| Gate | Result | Evidence |
| --- | --- | --- |
| Useful visible path | Pass | The exact `readFile` to terminal path is visible. |
| Stronger proof | Pass | The compiler-backed proof is stronger than the broad fallback. |
| Occurrence identity | Pass | The hidden HStack occurrence reconnects its caller-owned children without joining the sibling occurrence. |
| Project 2 seed | Pass | The records can seed the scope-neutral Project 2 slice. |

Project 2 is next, but it is not started until the next worker wave.

## Follow-up assigned to Project 4

Refresh restored only the default overview. Modal, route, proof view, selection,
and camera restoration remain Project 4 investigation-state work. They are not a
Project 1 blocker.

The browser harness did not observe Tab or Shift+Tab movement. Both controls are
native enabled buttons with no negative `tabindex`. Record this as a verification
limitation, not a Project 1 blocker.

Snapshot 3 passed `pnpm build` at `http://127.0.0.1:4321`. Stale loading progress
was fixed and production-verified PASS. No tests were run or changed.

## Below the cut line

- Full route source inventory
- All route component occurrences
- Complete transparent UI policy
- CLI and API adapters
- Source isolation across the whole route
- Rich code viewing
- Finding overlays
- Type and field lineage
- Automated tests without separate approval
