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

## Project decision gate

Review the visible slice before broadening the model.

Proceed only if:

- the path answers a useful product question;
- its proof is more trustworthy than the current fallback behavior;
- occurrence identity prevents the known shared-wrapper error;
- the new records can plausibly seed a non-route slice.

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

