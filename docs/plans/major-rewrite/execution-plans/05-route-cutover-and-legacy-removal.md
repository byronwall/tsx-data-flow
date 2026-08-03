# Project 5 — Route Cutover and Legacy Removal

## Outcome

Make the new evidence slice and route workspace authoritative. Remove the
conflicting models and experimental views that no longer serve the product.

This project stabilizes the completed route product. It should not add the next
major capability.

## Milestone 1: Prove cutover readiness

Compare product meaning across Pluck, the example pack, and at least one large
external local repository.

- **Change 1 — Run the route understanding review**
  - Confirm all proven origins, occurrences, boundaries, terminals, and gaps.
  - Confirm source selection and terminal backtracing.
  - Confirm shared UI definitions do not join unrelated callers.
- **Change 2 — Record performance evidence**
  - Measure analysis time, slice time, payload size, initial layout, and
    selection response.
  - Compare with the current local 100,000-line baseline.
- **Change 3 — Audit unsupported claims**
  - Inspect every fallback, partial edge, and gap family.
  - Remove any UI wording that implies unsupported completeness.
- **Change 4 — Review accessibility and operation**
  - Exercise keyboard selection, focus return, zoom controls, inspector access,
    and reduced label conditions.

### Desired end state

- The new route view serves the primary five-minute understanding job.
- The `readFile` scenario has exact source membership.
- Large-route interaction remains practical.
- Known gaps are visible and explained.
- The product review approves cutover.

## Milestone 2: Make the new contracts primary

Move route inventory, slice loading, and browser state to the new scope-neutral
contracts.

- **Change 1 — Promote scope inventory and flow slice DTOs**
  - Make the new API projection the route workspace source of truth.
  - Keep strict server and browser validation.
- **Change 2 — Retire route membership from semantic operation cards**
  - Stop using capped operation trajectories to advertise sources.
  - Keep useful operation evidence behind focused inspection where needed.
- **Change 3 — Remove browser proof reconstruction**
  - Delete source and component membership fallbacks from frontend models.
  - Keep layout and interaction as browser responsibilities.

### Desired end state

- One semantic slice drives source, occurrence, edge, terminal, and gap claims.
- The browser no longer invents or broadens proof.
- Route loading uses the scope-neutral contract.
- The old DTO no longer gates product behavior.

## Milestone 3: Remove obsolete products and code paths

Delete the UI and analyzer paths that would otherwise require duplicate
maintenance.

- **Change 1 — Remove the separate component structure view**
  - Preserve reusable layout and interaction helpers only when they fit the new
    workspace ownership.
- **Change 2 — Remove evidence cards**
  - Preserve useful code, operation, type, and finding evidence in the inspector
    model.
- **Change 3 — Remove broad source fallback logic**
  - Delete null-consumer and resource-wide matching from the old source lens.
- **Change 4 — Remove definition-merged topology construction**
  - Keep shared definitions as inspector and reuse evidence.
- **Change 5 — Remove obsolete route-only state and contracts**
  - Delete compatibility code after the new workspace no longer uses it.
  - Update product intent documents to name the new source of truth.

### Desired end state

- Only one route data-flow product remains.
- The component structure view and evidence cards are gone.
- No broad source fallback remains reachable.
- Shared definitions cannot collapse route occurrence ownership.
- Documentation matches the new behavior.

## Milestone 4: Close the approved verification phase

Run final quality work only after the user approves test changes.

- **Change 1 — Ask for the test-work decision**
  - Present the semantic risks that need regression protection.
  - Keep implementation complete without treating tests as implicit scope.
- **Change 2 — Add approved semantic regression coverage**
  - Favor small analyzer fixtures for source occurrence, slot ownership, gaps,
    bridges, and terminals.
  - Favor pure projection checks for transparent wrapper contraction.
  - Favor focused browser checks for selection and refresh behavior.
  - Avoid exact SVG coordinates and large text snapshots.
- **Change 3 — Run the repository quality gate**
  - Use `pnpm verify` after approved test updates.
  - Resolve product regressions without preserving obsolete behavior.

### Desired end state

- Approved semantic risks have focused regression coverage.
- Static checks and the approved final verification pass.
- No test freezes incidental graph coordinates or counts.
- The route rewrite is ready for ordinary use.

## Project decision gate

Use the new route workspace on real work before selecting Project 6 or later.

Review:

- which questions the graph answered well;
- which detail users opened most often;
- which gaps blocked useful analysis;
- whether types, findings, writes, or repository orientation offer the next
  highest product value.

## Below the cut line

- Type and field flow
- Finding impact paths
- Read-write reconciliation
- Application atlas
- Runtime augmentation
- Agent work packets
