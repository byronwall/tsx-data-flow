---
title: "Incremental generic field discovery"
status: draft — ready for implementation review
last_updated: 2026-08-12
---

# Incremental generic field discovery

## Goal

Make field proof useful for any source that the current proof grammar can already
understand. Keep the route graph readable. Preserve the current soccer analysis
until generic discovery proves parity.

## Product rules

1. Field focus controls visible proof. No selected field means no field-specific
   green. One selected field shows only its proven paths and frontiers.
2. Generic discovery covers every consumer already supported by the current proof
   grammar. It adds no syntax family.
3. Remove `FIELD_PROOF_TARGETS` in the generic discovery slice after soccer
   parity and the compact non-soccer fixture pass.

## Current state

The frontend already has source, field, and consumer URL state.
The source picker, field inspector, and graph already support field paths and frontiers.

The analyzer contract already separates available evidence, proven attachments,
and frontiers. The query starts from `FIELD_PROOF_TARGETS`, which names soccer
targets. Candidate search, component-boundary handling, transformation assembly,
transfer verification, bounds, identities, and frontier reasons are already
available.

The change should connect these existing parts. It should not create a second
graph, a new proof grammar, or a new policy framework.

## Positive examples to confirm in the running product

Use these current soccer records for Slice 1. They already exist in the G01–G18
acceptance data.

| Selected field | Expected proven consumers | Visible result |
|---|---|---|
| `games[*].opponentName` | `PageHeader.title` | One green proof path to the title. |
| `games[*].startsAt` | `PageHeader.description date` | One green proof path to the description. |
| `games[*].venueName` | `PageHeader.description venue`; `ScheduledGamePlanningDetails venue` | Two green consumer paths for the selected field only. |
| `games[*].status` | `PageHeader.eyebrow condition`; three `Show.when` conditions | Only status conditions are green. Other field paths stay neutral. |
| `games[*].id` | `A.href schedule`; `deleteGame.id`; scheduled and completed consumers | ID render, condition, and handler paths are green. Other fields stay neutral. |

For every row:

- Before selection, no field-specific path is green.
- Selecting the field shows only the listed field's proof.
- The inspector lists the same consumers.
- Clearing the field removes all field-specific green.

Use the compact non-soccer fixture for Slice 2. Its exact expected records are:

| Selected field | Expected result |
|---|---|
| `projects[*].name` | A direct render reaches `PageHeader.title`. |
| `projects[*].id` | The alias `id -> projectId` reaches `A.href project`. |
| `projects[*].ownerName` | A whole-object `project` prop reaches `ProjectDetails owner`. |
| `projects[*].code` | An unsupported formatter produces one named frontier and no green consumer. |

An unrelated object also has a `name` field. It must not appear as a consumer of
`projects[*].name`.

## Implementation slices

### Slice 1 — Add explicit one-field focus

#### Outcome

The user can select one field from the existing source field inventory. Before a
field is selected, the graph shows current route topology with no field-specific
green. After selection, the graph shows only that field's proven paths and
frontiers. Clearing the field removes field-specific styling and keeps the source
selected.

Keep `FIELD_PROOF_TARGETS` and all current soccer analysis unchanged.

#### Likely files

- `src/frontend/src/overview/TrajectorySourcePicker.tsx`
- `src/frontend/src/overview/DataTrajectoryDialog.tsx`
- `src/frontend/src/overview/trajectory-url-state.ts`
- `src/frontend/src/overview/RouteTrajectoryWorkspace.tsx`
- `src/frontend/src/overview/RouteTotalityGraph.tsx`
- `src/frontend/src/overview/RouteTotalityControls.tsx`
- `src/frontend/src/overview/RouteTotalityFieldSections.tsx`
- `src/frontend/src/overview/route-totality-field-inspector-model.ts`
- `src/frontend/src/overview/route-totality-field-lineage-model.ts`
- `src/frontend/src/overview/RouteTotalityOverview.tsx`

Use the existing result data for the inventory. Do not add a second analysis
request. Keep one normalized field path in URL state. Use source identity plus
field path for selection. Do not infer proof from a field label.

#### Acceptance checks

- Source selection still behaves as it does now.
- The field inventory is visible for the selected source.
- No field-specific green appears before field selection.
- One selected field shows only its proven paths and frontiers.
- A field with no proof is selectable but shows no green proof.
- Clear field focus restores the broad topology view.
- A stale or invalid field in the URL is cleared safely.
- Soccer G01–G18 behavior remains unchanged.
- Field focus reuses the selected-source result and does not repeat analysis.

#### Stop and review

Stop after the interaction works on the current soccer route. Review whether the
field scope is clear and whether the graph remains readable. Do not begin generic
discovery until this product state is accepted.

### Slice 2 — Add bounded generic discovery and remove the old policy

#### Outcome

In one bounded change, discover every consumer already supported by the current
proof grammar for the selected source. Return available fields, proven attachments,
and frontiers. Keep the old policy intact while the checks run. Remove it before
this slice closes.

Reuse the current:

- compiler-backed carrier search and its limits;
- candidate and component-boundary facts;
- transformation assembly;
- exact transfer verifier;
- deterministic IDs and sorting;
- attachment, frontier, and failure handling.

The generic query must fail closed. Unsupported transforms, ambiguous carriers,
dynamic indexes, and budget stops remain frontiers. They must not become green
paths. Do not add syntax families, capability flags, a registry, shadow phases,
or a second policy table.

#### Likely files

- `src/analysis/route-totality-field-proof-query.ts`
- `src/analysis/route-totality-field-proof-candidate.ts`
- `src/analysis/route-totality-field-proof-component-boundary.ts`
- `src/analysis/route-totality-field-proof-component.ts`
- `src/analysis/route-totality-field-proof-transformations.ts`
- `src/analysis/route-totality-field-transfer-verifier.ts`
- `src/analysis/route-totality-field-proof-result.ts`
- `src/analysis/route-totality-field-lineage.ts`
- `src/api/route-totality-field-lineage-contracts.ts`
- `src/api/route-totality-field-lineage-validation.ts`
- `src/api/projections/route-totality-field-lineage.ts`
- `src/analysis/route-totality-field-proof-policy.ts`
- `src/analysis/route-totality-field-target-consumer.ts`
- the existing route field-proof test and fixture locations
- `scripts/accept-route-field-proof.ts`
- `scripts/route-field-proof-obligations.json`

Prefer changes to existing modules. Add one focused discovery module only if the
query cannot stay clear without it. Keep the public contract strict. Keep current
carrier limits, field and output bounds, exact source identity, semantic consumer
identity, ordered transformation ledgers, and frontier reasons.

#### Compact non-soccer fixture

Add one small route fixture with these cases:

1. `projects[*].name` renders through `PageHeader.title`.
2. `projects[*].id` becomes `projectId` and reaches `A.href project`.
3. A whole-object `project` prop carries `projects[*].ownerName` to
   `ProjectDetails owner`.
4. An unrelated object has the same `name` field as the negative control.
5. `projects[*].code` crosses an unsupported formatter and ends at a named
   frontier.

The fixture must prove the selected field, its direct and aliased consumers, and
the component prop transfer. The equal-name case must produce no false positive.
The unsupported transform must retain the field as available and report a stable
frontier reason. Keep the fixture small. Do not add future syntax examples here.

#### Acceptance checks

- The maintained acceptance runner passes soccer G01–G18.
- Generic output satisfies every soccer positive, terminal, transformation, and
  required frontier obligation by semantic identity.
- The compact fixture passes all three positive shapes.
- The equal-name control has no attachment.
- The unsupported transform has a frontier and no green path.
- Zero-positive output is rejected when a required positive exists.
- IDs, ordering, evidence paths, bounds, and cache behavior remain deterministic.
- No selected field means no field-specific green in the existing UI.
- One selected field shows only its generic attachments and frontiers.
- No production import references `FIELD_PROOF_TARGETS` or soccer target keys.
- Lint and typecheck pass. Do not use them as a substitute for field proof.

#### Stop and review

First prove parity while the old policy remains available. Then remove declarations
and imports that exist only to name soccer targets. Keep the soccer obligations as
acceptance data. If parity fails, keep the old policy and repair generic discovery.

Stop for final product review after the policy is removed. Confirm each positive
example in the running UI. Future grammar support requires a separate change.

## Rollback and cut line

Keep the current target-led query and policy declarations intact until generic
discovery passes soccer and non-soccer acceptance. If discovery fails, restore the
old query and continue the same slice.

The cut line is proven parity inside Slice 2. After that checkpoint, remove
`FIELD_PROOF_TARGETS` before the slice closes. The acceptance obligations remain
as data. The field-focus UI remains independent of the policy path.

## Non-goals

- Add a new proof syntax family.
- Add a capability registry, family flags, or shadow phases.
- Build a second route graph or project-wide field browser.
- Highlight all generic results at once.
- Add multi-select or automatic first-field focus.
- Infer proof from field-name text.
- Prove unsupported transforms by approximation.
- Change broad route topology or unrelated soccer analysis.
- Replace the acceptance runner with production discovery.
- Update the other planning documents named in the task.

## Open questions

No question blocks Slice 1. Two details can be settled during implementation:

1. What exact field-count and payload caps fit the existing response budget?
2. Which existing fixture location is the smallest stable home for the compact
   non-soccer route case?

Both questions are bounded by current code and do not change the two-slice
direction.

## Start here

The first worker should implement Slice 1 only.

1. Read `docs/application-structure.md` and the relevant frontend files.
2. Inspect the current field rows, URL reconciliation, and graph focus selectors.
3. Add one-field selection to the existing source picker.
4. Preserve current analysis and use existing result data.
5. Verify no-focus, focused, and clear states on the soccer route.
6. Stop for review. Do not begin generic discovery in the same change.
