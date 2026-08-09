# Project 4.1 Field-to-Component Parity Plan

**Date:** 2026-08-08

**Status:** Ready for implementation

**Parent plan:** [Projects 1–5 reconciliation and completion plan](20260805-projects-1-5-reconciliation-and-completion-plan.md)

## Outcome

Route Totality shows which proven source fields reach each component occurrence
and render terminal for one selected origin.

The implementation must:

- start from one exact evidence origin and role;
- preserve field identity only through explicit proven transitions;
- attach terminal-qualified fields to exact `RouteRenderOccurrence.id` values;
- keep consumer handoffs separate from field lineage;
- show no label after field identity becomes lost;
- preserve proof locations, accepted evidence IDs, and stop reasons; and
- keep field renames, packing history, derivation, spreads, and complete shape
  flow out of scope.

## Decisions

- Add a dedicated field-lineage collection to `RouteTotalityRecord`.
- Compute all origin-keyed records during route analysis.
- Filter records in the frontend with an active exact origin identity.
- Keep field lineage separate from `bridges` and `contextContinuity`.
- Read property segments from raw compiler-backed field evidence before API
  normalization. Publish only the narrow `fieldName` and `operationKind`
  evidence needed to validate that exact identity. Do not publish raw analyzer
  attribute objects.
- Build canonical nested labels from exact chained reads, such as
  `profile.name`. Keep element IDs as the identity.
- Keep `component-prop` consumer handoffs separate from field lineage. In
  Milestone 1, a proven `component-prop` preserves only that consumer handoff.
  It emits no field attachment and does not enter the component body. A field
  attachment across that boundary requires later unique occurrence-specific
  `component-prop-binding` evidence.
- Start with named property reads.
- Add literal string and numeric index reads in Milestone 3. Reject every
  computed index.
- Keep a field-origin focus while the user inspects occurrence nodes.
- Leave legacy source-picker and URL unification to Project 4.2.

## Safety model

Track two independent states while a path is projected:

```text
origin identity: exact | lost
field identity:  absent | exact | lost
```

Each accepted transition defines its direction, endpoint kinds, required proof,
uniqueness rule, and identity effect. Field identity never resumes after it is
lost. A later same-name read starts new evidence. It does not repair an older
path.

Milestone 1 policy:

| Transition | Origin identity | Field identity | Rule |
| --- | --- | --- | --- |
| Exact alias | Preserve | Preserve | Require the endpoint-aware transition table. |
| `field-input` into `field-read` | Preserve | Begin | Use the exact field element and property evidence. |
| Exact argument binding | Preserve | Preserve | Require one resolved call and parameter. |
| `component-prop` | Preserve | Stop | Preserve only the consumer handoff. Emit no Milestone 1 field attachment or downstream label. Do not enter the component body. |
| Exact JSX prop binding | Preserve | Preserve or remain absent | Requires later unique occurrence-specific `component-prop-binding` evidence. |
| Exact return | Preserve | Preserve | Require one proven return path. |
| Object pack, spread, or rename | Stop | Stop | Record an explicit frontier. |
| Dynamic index or ambiguous merge | Lost | Lost | Show no downstream field label. |

## Implementation specification

This section fixes the architecture for the implementation workers. A worker
can refine names during normal code review. It must not replace these ownership
boundaries or proof rules without returning the decision to the orchestrator.

### Domain model

Add `fieldLineage` to `RouteTotalityRecord`. It is always present and uses one
of these statuses:

```typescript
type RouteTotalityFieldLineage = {
  status: "complete" | "partial" | "unavailable";
  unavailableReason: string | null;
  attachments: RouteTotalityFieldAttachment[];
  frontiers: RouteTotalityFieldFrontier[];
  counts: {
    origins: number;
    fields: number;
    occurrences: number;
    terminals: number;
    frontiers: number;
  };
  omissions: string[];
};

type RouteTotalityFieldAttachment = {
  id: string;
  origin: { elementId: string; role: OriginRole };
  field: {
    elementIds: string[];
    segments: Array<{
      kind: "property" | "string-index" | "numeric-index";
      value: string;
    }>;
    label: string;
    location: SourceLocation;
  };
  occurrenceId: string;
  terminalIds: [string];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  proof: EvidenceProof[];
  locations: SourceLocation[];
};

type RouteTotalityFieldFrontier = {
  id: string;
  origin: { elementId: string; role: OriginRole };
  field: {
    elementIds: string[];
    segments: Array<{
      kind: "property" | "string-index" | "numeric-index";
      value: string;
    }>;
    label: string;
  } | null;
  occurrenceId: string | null;
  reason:
    | "partial-proof"
    | "identity-lost"
    | "ambiguous-target"
    | "unsupported-relation"
    | "unsupported-transform"
    | "dynamic-index"
    | "renamed-prop"
    | "multiple-origins"
    | "evidence-truncated"
    | "unmapped-occurrence"
    | "unmapped-terminal";
  gapId: string | null;
  stoppedAtElementId: string | null;
  stoppedAtRelationId: string | null;
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  location: SourceLocation | null;
  proof: EvidenceProof[];
};
```

Use one attachment for each exact tuple:

```text
origin element and role
  + field element chain
  + route occurrence
  + render terminal
```

Milestone 1 stores exactly one terminal ID in each attachment. The terminal
anchor is the final `evidencePathElementId`. Emit separate attachments for
separate proven terminals. A consumer boundary is not a terminal-qualified
field attachment.

A frontier's optional field describes the last exact identity before the stop.
It never attaches that label to a downstream occurrence. `unavailableReason`
is non-null only when status is `unavailable`.

Create IDs with `stableHash()` from semantic IDs. Never use array positions,
labels, component names, or definition IDs in identity keys.

### Field label rules

- Read property segments from `ProgramElement.attributes.property`.
- Require a property segment to have `kind: "field-read"`,
  `operationKind: "field-read"`, proven confidence, source proof, and one
  non-empty static property.
- Build nested paths only from consecutive proven `field-input` relations.
- Use element IDs as identity.
- Format property segments as `profile.name`, string indexes as `["name"]`,
  and numeric indexes as `[0]`. Mixed paths use `items[0].name`.
- Do not use `ProgramElement.label` as a join key.
- In Milestone 3, read a literal index only from raw `index-read` metadata.
  Do not include computed or dynamic index expressions.
- Do not append the same prop segment twice when an exact component binding
  repeats the incoming field at the component parameter.

### Projection algorithm

Implement the algorithm in a new
`src/analysis/route-totality-field-lineage.ts` module.

Extract the private occurrence and terminal anchor logic from
`route-totality-bridge.ts` into
`src/analysis/route-totality-anchor-index.ts`. Both bridges and field lineage
must use this module. The index returns exact evidence-element-to-occurrence and
evidence-element-to-terminal mappings. It reports ambiguous or missing matches
instead of selecting one. This extraction must preserve current bridge output.

1. Receive `EvidenceRelationProvider`, `EvidenceSlice`,
   `RouteOccurrenceSurface`, and the route seed.
2. Restrict raw fact lookup to element and relation IDs already included in the
   bounded evidence slice.
3. Start only from origins whose origin record, element, and proof are proven.
4. Traverse proven relations in their stored data-flow direction.
5. Carry `originIdentity`, `fieldIdentity`, `currentOccurrenceId`, and the
   accepted path in each traversal state.
6. Apply the transition table below. Every unlisted relation ends that branch.
   Create a frontier only when the stopped branch already has a field.
7. Map generic occurrences and terminals to the route surface through the same
   exact source anchors used by Route Totality bridges.
8. Use the root occurrence only through the route seed anchor. Never map a
   shared definition to all of its occurrences.
9. Emit an attachment only when an exact field reaches one exact render terminal
   owned by its exact occurrence.
10. Store that terminal anchor as the final evidence path element. Store one
    terminal ID per attachment.
11. Deduplicate attachments and frontiers by semantic IDs.
12. Sort origins, fields, occurrences, terminals, paths, and frontiers by stable
    IDs before projection.

Use one shared endpoint-aware transition classifier in traversal and strict
validation. A relation name alone never preserves identity. Every accepted
source, target, relation, and proof entry is `proven` and has at least one
source location. Never queue partial, missing, unsupported, or ambiguous
transitions.

| Relation | Exact accepted endpoints and uniqueness | Field effect |
| --- | --- | --- |
| `references` | Source is `value`, `alias`, `parameter`, `field-read`, `call`, `resource-result`, or the exact initial origin. Target is `value`, `alias`, or `field-read`. Exactly one proven relation joins that source and target. | Preserve. |
| `argument-binding` | Source is `value`, `alias`, `field-read`, `call`, or `parameter`. Target is exactly one compiler parameter. | Preserve. |
| `return-expression` | Source is `value`, `alias`, `field-read`, `call`, or `parameter`. Target is exactly one return. | Preserve. |
| `return-value` | Source is a return. Target is a call with exactly one proven incoming return-value. | Preserve. |
| `resource-result` | Only while field identity is absent. Source is `resource-input`; target is exactly one bound `alias` or `resource-result` value for that declaration. | Preserve origin only. |
| `field-input` | The current receiver has exactly one proven target: a static named `field-read` with `operationKind: "field-read"`. | Begin or append the exact field. |
| `component-prop` | Only while field identity exists. Target is a `component-occurrence` with one unshared exact occurrence anchor. | Stop at the consumer boundary. Keep the handoff in Route Totality bridges. Do not create a Milestone 1 field attachment. |
| `render-terminal` | Only while field identity exists. Target is a render terminal with one unshared exact anchor that is owned by the current occurrence. | Attach the terminal and stop. |

`selection`, `pack-field`, `index-read`, definitions, component occurrences,
and every unsupported endpoint fail closed even if the relation kind is listed
above. Reject duplicate proven reference source-target relations. Do not infer
identity from equal field names.

Do not traverse these kinds for field continuity:

```text
contains, declares-parameter, definition, invokes, argument, performs,
pack-field, renders, component-occurrence, component-prop-binding, input-call,
resource-loader, effect-input, http-bridge
```

The generic evidence slice can still show these relations. Field lineage stops
at them unless a later approved milestone adds an explicit semantic rule.

When a field exists, emit these exact stops:

| Condition | Frontier reason |
| --- | --- |
| Selection endpoint or unsupported relation | `unsupported-relation` |
| Ambiguous binding, duplicate reference, or shared occurrence or terminal anchor | `ambiguous-target` |
| More than one proven incoming `return-value` for a call | `multiple-origins` |
| `resource-result` after a field exists | `unsupported-transform` |
| Partial or missing endpoint, relation, proof, or raw static-field evidence | `partial-proof` |
| Missing occurrence anchor | `unmapped-occurrence` |
| Missing terminal anchor or terminal ownership | `unmapped-terminal` |
| Cycle in an accepted path | `identity-lost` |
| Dynamic index read | `dynamic-index` |

Before the first field-read, stop silently. Never make a field from unsupported
evidence. A later same-name field does not resume an earlier field identity.

Use a visited key of:

```text
origin ID and role
  + current element ID
  + current occurrence ID
  + field element ID chain
  + field state
```

For duplicate paths to one attachment, keep one canonical path. Prefer fewer
relations, then compare the joined relation IDs lexically. Do not merge path
fragments from different candidates.

### Exact component prop binding

Milestone 1 does not add or traverse `component-prop-binding`. A
`component-prop` remains a consumer handoff and stops field lineage at its
boundary. Milestones 2 and 3 use this exact binding policy.

Create one proven occurrence-specific `component-prop-binding` element at the
JSX attribute location. It connects one exact `component-prop` boundary to one
exact parameter-rooted receiver. It carries one unique component occurrence
anchor and one unique parameter evidence element.

The accepted path is:

```text
exact component-prop boundary
  → one occurrence-specific component-prop-binding element
  → one exact parameter-rooted receiver
```

Accept the binding only when all conditions are true:

- The JSX tag resolves to one in-project function component.
- The attribute is one static `JsxAttribute` with one expression value.
- The occurrence anchor resolves to exactly one component occurrence.
- The parameter evidence resolves to exactly one compiler parameter.
- The receiver is rooted in that exact parameter symbol.
- The receiver belongs to that exact resolved component definition.
- The binding, endpoints, and all proof entries are proven and located.
- The binding has one candidate at each required endpoint.

More than one binding, occurrence anchor, parameter evidence element, or
receiver candidate emits `ambiguous-target`. No binding stops at the consumer
boundary. Equal prop and parameter names are never proof.

Reject spread, rest, destructuring, rename, optional or dynamic keys, computed
variables, template expressions, symbols, wrappers, packing, derivation, and
shape transforms. Use the existing bounded fail-closed frontier reason. Do not
infer a binding from displayed text.

When a binding is accepted, preserve an existing exact field identity only when
the binding proves the same exact receiver. Do not append a duplicate segment.
A different exact prop is `renamed-prop`. A parameter-rooted receiver without
an incoming field remains a handoff carrier. It is not a displayed source field.

### Transport and validation

- Add `fieldLineage` to the strict Route Totality object in
  `src/api/route-totality-contracts.ts`.
- Project it in `src/api/projections/route-totality.ts`.
- Add `src/api/route-totality-field-lineage-validation.ts`.
- Call the new validator from `validateRouteTotality()`.
- Keep the change additive. Do not change existing bridge, context, finding, or
  occurrence DTO meanings.

The validator must reject:

- duplicate attachment or frontier IDs;
- missing unavailable reasons or reasons present on available projections;
- unknown origins, field elements, occurrences, terminals, or relation IDs;
- non-proven origins or field elements in an attachment;
- mismatched field segments and canonical labels, including index formatting;
- definition IDs used where occurrence IDs are required;
- unsorted or duplicate terminal and path IDs;
- discontinuous relation paths;
- terminal references outside the attachment's proven route path;
- an attachment with other than one terminal ID;
- a terminal anchor that is not the final attachment path element;
- a truncation frontier without one exact concrete gap;
- a complete status with omissions, partial proof, or frontiers; and
- an unavailable surface or evidence slice with non-empty attachments.

For Milestone 1, strict validation also enforces these non-negotiable rules:

- The origin record and its exact evidence element each exist once. Their role
  and kind match. Both are fully proven and every proof is located.
- Each field element is a fully proven static `field-read` with
  `operationKind: "field-read"`, an exact `fieldName`, matching segment, and
  matching final read location. Adjacent field elements have exactly one proven
  `field-input` relation.
- An attachment path begins at the exact origin. It has unique existing fully
  proven elements and relations. It has one relation per adjacent pair. Each
  pair satisfies the shared endpoint-aware transition classifier.
- An attached occurrence exists, is not a definition, and has one unshared
  exact evidence anchor. A root is valid only when it is the exact route seed.
- Every Milestone 1 attachment has exactly one terminal. The terminal is
  render-owned by the attachment occurrence. Its one unshared evidence anchor
  is the final attachment path element. Validation uses the stored canonical
  path. It does not accept a terminal through a fresh graph search or a
  same-name match.
- A truncation frontier has one `gapId`. The gap exists once and its `from`
  equals `stoppedAtElementId`. Its stored canonical path starts at the exact
  origin and ends at that element. Its location and partial proof equal the
  exact gap and canonical path proof. Other frontier reasons have `gapId: null`.
- `unavailable` has no records, zero counts, and one omission equal to its
  reason. `complete` has no frontier, omission, partial input, or partial
  proof. `partial` requires a frontier, partial or truncated input, or capped
  output. `counts.frontiers` counts emitted records only.

### Frontend state and display

Add a local `activeFieldOrigin` signal to `RouteTotalityGraph`. Its value is the
exact `{ elementId, role }` pair.

State rules:

- Selecting a proven origin sets or replaces the field focus.
- Selecting an occurrence, terminal, edge, or inspector link preserves it.
- Clearing graph selection preserves it.
- A visible focus chip names the active origin and provides `Clear field focus`.
- Changing route, renderer, generation scope, or totality payload clears it.
- Remove it if the origin ID and role no longer exist in the payload.
- Do not write it to `trajectory-url-state.ts` in Project 4.1.
- Refresh therefore clears it. Project 4.2 will own persistence and picker
  integration.

Wrap `actions.select` and `actions.selectFromInspector` inside
`RouteTotalityGraph`. Update field focus before delegating the selection. Clear
the focus in the existing scope and payload reconciliation effect. Pass the
active origin and clear action to `RouteTotalityControls`; do not add it to
`RouteTotalityInvestigationStateChange`.

Create a pure
`src/frontend/src/overview/route-totality-field-lineage-model.ts` selector.
It returns:

- attachments for the active origin grouped by original occurrence ID;
- sorted unique labels for each occurrence;
- matching frontiers;
- terminal and proof summaries; and
- original-to-visible occurrence mapping through `layout.nodeRedirects`.

Inspector behavior:

- No active origin: show `Select an origin to show proven fields.`
- Unavailable field lineage: show `unavailableReason` and no field labels.
- Partial field lineage: show proven fields and the separate stopped section.
- Active origin with no fields: show `No proven fields reach this occurrence.`
- Proven fields: show every label, exact read location, terminal count, and proof
  action.
- Frontiers: show a separate `Field continuity stopped` section.
- Consumer handoffs remain in the existing evidence and neighbor sections.
- Never put fields in `definition` or `otherCallSites`.

Graph behavior:

- Build a field-summary map from original occurrence IDs.
- Pass it to `RouteTotalityGraphMarks.tsx`.
- Replace the normal occurrence summary line with one non-interactive field
  summary while field focus is active. Keep node dimensions unchanged.
- Show at most three sorted labels separated by ` · ` and one `+N` summary.
- Keep the full list in the inspector.
- Do not add field nodes, edges, selection IDs, or layout forces.
- Redirect labels from hidden occurrences to the visible occurrence only for
  display. Keep their records keyed by original occurrence IDs. In the
  inspector, group redirected fields under each original call site.

### UI visual contract

The current component-topology source lens is the visual authority. Reuse its
green path and field treatment. Do not design a new field-lineage visual
language.

Prior-art sources:

- `ComponentTopologyGraph.tsx`
  - `source-focused` exact path edges;
  - `source-path` component strokes;
  - `source-dimmed` non-participants;
  - `component-topology-field-label` field summaries; and
  - the existing three-label `fieldLabel()` compaction rule.
- `ComponentTopologyInspector.tsx`
  - `Source fields through this component` hierarchy;
  - monospace field rows; and
  - field label plus supporting count layout.
- `style.css`
  - exact lineage green `#3f8f60`;
  - exact field text green `#28633d`;
  - exact field panel fill `#edf7f0`; and
  - exact source fill `#e3f3e9`.
- Existing Route Totality UI
  - blue selected and keyboard-focus treatment;
  - blue dashed data or consumer handoff treatment;
  - amber dashed frontier and gap treatment;
  - source-location and proof actions; and
  - current empty and unavailable inspector patterns.

Add shared semantic CSS variables without changing the current topology view:

```css
--lineage-proven: #3f8f60;
--lineage-field-text: #28633d;
--lineage-field-fill: #edf7f0;
--lineage-source-fill: #e3f3e9;
```

Replace the matching hard-coded values in the current topology styles with
these variables. Use the same variables in Route Totality. This is a mechanical
visual-token extraction. It must not change current topology layout or
behavior.

Route Totality field-focus rules:

- Exact field-lineage edges use solid `--lineage-proven`, 1.8px width, and
  `.82` opacity, matching `source-focused`.
- Exact participating occurrence and terminal marks use a
  `--lineage-proven` stroke at 1.8px.
- Non-participating nodes and edges use the current source-lens dimming level.
- Consumer-only `component-prop` handoffs stay blue and dashed. They never turn
  green without exact field continuity.
- Field frontiers stay amber and dashed. They never use the proven green.
- Selection and keyboard focus stay blue. Use the existing blue outline so it
  does not replace the green lineage stroke.
- Field labels use the current topology field-label treatment: monospace,
  9px, weight 750, `--lineage-field-text`, and the existing background paint
  stroke for legibility.
- While field focus is active, replace the occurrence's normal summary line
  with the compact green field summary. Restore the normal summary when focus
  clears.
- The field summary is display-only. It is not a new focus or selection target.
- Add `Proven field path` to the existing legend with the current solid green
  line sample.

Inspector field section:

- Reuse the structure of `component-topology-node-fields`.
- Title it `Source fields through this occurrence`.
- Use the same pale-green fill, green uppercase heading, and green monospace
  field labels.
- Show each label with its proven render-terminal count.
- Group display-redirected records by original call-site label and location.
- Place exact source actions inside each field row with the same quiet link
  treatment as Route Totality proof locations.
- Keep `Field continuity stopped` in the existing amber frontier style.
- Keep consumer handoffs in the existing neutral or blue evidence sections.

Field-focus control:

- Place one compact focus block between the route title and toolbar actions.
- Use the pale-green field fill and green field text.
- Show `Fields from`, the active origin label, and a visible
  `Clear field focus` button.
- Reuse current toolbar spacing, button sizing, and focus-visible treatment.
- Do not add a picker, popover, menu, or URL control in Project 4.1.

Visual precedence:

1. Keyboard focus and selected-node outline.
2. Proven green field path.
3. Amber frontier.
4. Blue consumer handoff.
5. Dimmed non-participants.

Before UI edits, the UI worker must capture a desktop reference screenshot of
the current component-topology view on `/roster` with one source selected and
field labels visible. After implementation, capture the matching Route Totality
state. Compare path color, node participation, field labels, inspector density,
and empty space side by side. Keep screenshots out of the repository unless
Byron requests them.

No ImageGen mock is required for the approved scope. Every new element has
direct incumbent prior art. Stop for a high-fidelity mock and Byron's approval
before adding any of these unplanned surfaces:

- independently selectable field nodes or field edges;
- a field transformation timeline;
- multiple-origin comparison;
- a new persistent source picker;
- a field-path minimap or overview panel; or
- a new visualization for renamed, packed, or derived fields.

### Bounds and status

- Reuse the evidence slice's depth, element, relation, and terminal budgets.
- Set `MAX_FRONTIERS` to `256`.
- Retain the lexicographically smallest 256 unique frontier IDs. Track every
  other unique ID once. When capped, add exactly:
  `Field frontier limit reached; <N> additional frontiers were omitted. The emitted frontier count is a lower bound.`
  Do not add a public omitted-count field.
- Record truncation only when a field-bearing state touches a concrete slice gap
  at its exact current element or immediately after an accepted edge. Retain the
  origin, field IDs, current element, unique occurrence, canonical path, gap
  ID, gap location, and gap proof. Emit one `evidence-truncated` frontier per
  unique semantic tuple after traversal. The semantic tuple is origin, field,
  current element, occurrence, and reason. It does not include `gapId`. When
  multiple gaps match one tuple, use the lexicographically smallest gap ID as
  the canonical proof source. Include a relation only if the gap names that
  relation. Store the canonical path IDs on the frontier. Do not make a frontier
  from a global truncation flag. A gap before the first field-read produces no
  field frontier.
- Call `cancellation.throwIfCancelled()` before, during, and after bounded
  loops, map and set construction, path lookup, proof or location projection,
  and validator return. Use a cancellable stable sort whose comparator checks
  cancellation in anchor indexing, traversal, attachments, frontiers, counts,
  projection, and strict validation.
- Use the cancellable projection helpers for DTO arrays.
- Do not query facts outside the materialized slice.
- Keep one canonical path for each attachment.
- Keep one frontier for each origin, field chain, stop endpoint, occurrence,
  and reason. Use the same semantic ID when a truncation gap changes.
- Mark field lineage `partial` when it has an emitted frontier, a partial or
  truncated input, or capped frontier output. The emitted frontier count is a
  lower bound when the cap omission is present.
- Mark it `unavailable` when the occurrence surface or evidence slice is
  unavailable.
- Mark complete zero-field output as `complete` when both inputs are complete
  and no eligible field read exists.
- Do not let field-lineage status change the existing Route Totality status in
  Project 4.1. Field lineage reports its own status and omissions.

### File ownership

Analyzer ownership:

- New: `src/analysis/route-totality-field-lineage.ts`
- New: `src/analysis/route-totality-field-lineage-transition.ts`
- New: `src/analysis/route-totality-field-lineage-support.ts`
- New: `src/analysis/route-totality-field-lineage-attachment.ts`
- New: `src/analysis/route-totality-field-lineage-counts.ts`
- New: `src/analysis/route-totality-field-lineage-frontier.ts`
- New: `src/analysis/route-totality-field-lineage-index.ts`
- New: `src/analysis/route-totality-field-lineage-result.ts`
- New: `src/analysis/route-totality-field-lineage-truncation.ts`
- New: `src/analysis/route-totality-anchor-index.ts`
- New: `src/analysis/cancellable-stable-sort.ts`
- Modify: `src/analysis/scope-seam.ts`
- Modify: `src/analysis/evidence-slice-support.ts`
- Modify: `src/analysis/route-totality-bridge.ts`
- Modify: `src/analysis/route-data-totality.ts`

API ownership:

- Modify: `src/api/route-totality-contracts.ts`
- New: `src/api/route-totality-field-lineage-contracts.ts`
- Modify: `src/api/projections/route-totality.ts`
- Modify: `src/api/projections/route-totality-field-lineage.ts`
- Modify: `src/api/projections/cancellable-projection.ts`
- New: `src/api/route-totality-field-lineage-validation.ts`
- New: `src/api/route-totality-field-lineage-validation-index.ts`
- New: `src/api/route-totality-field-lineage-validation-frontier.ts`
- New: `src/api/route-totality-field-lineage-validation-path.ts`
- New: `src/api/route-totality-field-lineage-validation-terminal.ts`
- New: `src/api/route-totality-field-lineage-validation-structure.ts`
- Modify: `src/api/route-occurrence-validation.ts`

Frontend ownership:

- New: `src/frontend/src/overview/route-totality-field-lineage-model.ts`
- Modify: `src/frontend/src/overview/RouteTotalityGraph.tsx`
- Modify: `src/frontend/src/overview/RouteTotalityControls.tsx`
- Modify: `src/frontend/src/overview/RouteTotalityGraphMarks.tsx`
- Modify: `src/frontend/src/overview/route-totality-inspector-model.ts`
- Modify: `src/frontend/src/overview/RouteTotalityInspector.tsx`
- Modify: `src/frontend/src/style.css`

Do not use these legacy modules as the new source of truth:

- `src/analysis/route-data-trajectories.ts`
- `src/api/projections/route-data.ts` legacy field records
- `src/frontend/src/overview/topology-source-lens.ts`
- `src/frontend/src/overview/ComponentTopologyInspector.tsx`

### Acceptance examples

These examples define the intended behavior. They are not optional design
prompts.

| Case | Required result |
| --- | --- |
| Route root reads `source.name` and renders it | The root occurrence and exact terminal show `name`. |
| `<Child name={source.name}>` and `Child` reads `props.name` | The caller and child occurrences show `name`; the child terminal shows `name`. |
| `<Child user={source}>` and `Child` reads `props.user.name` | `user` remains a consumer handoff; the child occurrence and terminal show source field `name`. |
| Two calls pass different source fields to one component definition | Each call-site occurrence shows only its own field. |
| Two origins both have a `name` field | Selecting either origin shows only its compiler-backed path. |
| `<Child title={source.name}>` | The child occurrence keeps the consumer handoff. Field continuity stops with `renamed-prop`. |
| `function Child({ name })` | The handoff remains visible. No downstream field label appears. |
| An object pack or spread carries a field | The handoff remains visible. Field continuity stops with `unsupported-transform`. |
| `source["name"]` or `source[0]` | Milestone 3 shows the canonical exact index label. |
| `source[key]` | No field label appears. A `dynamic-index` frontier appears. |
| A conditional merges two possible origins | Neither selected origin receives a field label after the merge. |
| Evidence coverage truncates the path | No label appears after truncation. An `evidence-truncated` frontier appears. |
| Conditional LEFT/RIGHT merge after `source.name` | No downstream label. Emit an `unsupported-relation` frontier. |
| One call has multiple proven incoming returns | No downstream label. Emit a `multiple-origins` frontier. |
| Repeated `Child` occurrences share one evidence anchor | Bridge entries remain one per route endpoint. Field lineage emits `ambiguous-target` and attaches no label. |
| A slice gap follows the `NAME` field-read before a terminal | Emit one `evidence-truncated` frontier with the last field and element. Do not attach a terminal. |
| Two gaps follow the same field state | Emit one `evidence-truncated` frontier with the lexicographically smallest gap ID. |
| An `evidence-truncated` frontier has no exact gap | Strict validation rejects the frontier. |
| A proven origin record has a partial matching evidence element | Strict validation rejects the lineage record. |
| 300 unique field frontiers | Retain the lexicographically smallest 256. Report exactly 44 omitted frontiers with the lower-bound wording. |
| A terminal anchor maps to more than one terminal endpoint | Emit `ambiguous-target`. Do not attach a terminal label. |
| A stored path ends at terminal A but terminal IDs contain A and B | Strict validation rejects the attachment. |
| Cancellation during anchor extraction, frontier sort, or terminal validation | Throw cancellation. Do not return a completed result. |
| A hidden occurrence redirects to a visible node | The graph shows the union summary. The inspector groups fields by original occurrence and call site. |
| A context member has the same field name | Context continuity remains separate and creates no field-lineage record. |

The implementation fails this project if it obtains a field label through
component names, definition IDs, raw labels, equal strings, or merged path
fragments.

### Coverage audit

| Requirement or risk | Fixed plan location | Delivery milestone |
| --- | --- | --- |
| Exact selected origin and role | Domain model, projection step 3, field-focus state | 1 |
| Proven named property reads | Field label rules and raw fact lookup | 1 |
| Exact attachment occurrence identity | Shared anchor index and terminal-qualified occurrence attachments | 1 |
| Proven render terminals | Attachment `terminalIds` and path validation | 1 |
| Exact component prop continuity | Occurrence-specific binding element and supported binding shapes | 2 |
| Consumer handoff separation | Existing `component-prop` remains unchanged | 2 |
| No equal-name joins | Element-ID identity and exact target binding | 1–3 |
| No label after identity loss | Transition state, frontiers, and acceptance matrix | 3 |
| Repeated and hidden occurrences | Original occurrence keys and display-only redirects | 3–4 |
| Static literal indexes | Typed index segments and canonical labels | 3 |
| Dynamic, packed, renamed, derived, or merged values | Explicit stop rules and frontiers | 3 |
| Strict additive transport | Field schema, projection, and dedicated validator | 1 |
| Empty, partial, and unavailable behavior | Field status plus inspector messages | 1–4 |
| Bounded runtime and payload | Slice budgets, indexed binding lookup, canonical paths | 1–4 |
| Cancellation and deterministic output | Loop checks, cancellable projection, stable sorting | 1–4 |
| Solid SSR safety | DTO-driven state and non-structural graph labels | 4 |
| UI prior art and visual semantics | Green topology path, field panel, blue handoff, amber frontier | 4 |
| Product verification and recovery | Clean-room browser loop and focused repair | 5 |
| Tests under repository policy | Explicit post-approval test plan | After 5 |

## Milestone 1: Show one proven field end to end

Deliver the smallest useful Route Totality slice. One exact origin must show one
named property on one component occurrence and one render terminal. This slice
does not cross a component prop-to-parameter boundary.

Milestone 1 has these fixed repair constraints:

- `route-totality-anchor-index.ts` keeps forward `occurrenceAnchors` and
  `terminalAnchors` arrays for Route Totality bridges. It also keeps reverse
  arrays, not singular maps:
  `occurrenceAnchorsByEvidenceElementId` and
  `terminalAnchorsByEvidenceElementId`. Each reverse value is sorted by route
  endpoint ID. It preserves every endpoint. Per-endpoint issue maps mark
  missing anchors and evidence anchors shared by multiple endpoints.
- Field lineage uses a reverse anchor only when its array has exactly one
  endpoint. Zero maps to `unmapped-occurrence` or `unmapped-terminal`; more
  than one maps to `ambiguous-target`. Ordinary bridge generation continues to
  use the forward arrays, so it preserves one bridge per route endpoint and
  prior bridge counts.
- The traversal and strict validator call the same endpoint-aware transition
  classifier. They do not use a relation-kind allow list.
- A Milestone 1 attachment has exactly one render terminal. Its terminal anchor
  is the final canonical path element and its owner is the attachment occurrence.
  A `component-prop` stays a separate consumer handoff and stops at the boundary.
- An `evidence-truncated` frontier stores one exact `gapId`. Its gap source is
  the stopped element. Its canonical path proof and location must match that
  gap. Other frontier reasons store `gapId: null`.
- Do not implement JSX prop bindings, literal index labels, renames, packing
  history, derivation, shape transforms, or full graph green-path parity.

- **Change 1 — Add a bounded Route Totality field projection**
  - Add a focused analyzer module beside the existing totality modules.
  - Extract and reuse one exact Route Totality anchor index.
  - Preserve existing bridge records and counts during the extraction.
  - Start from one exact evidence origin and role.
  - Use exact `field-read`, occurrence anchor, and terminal identities.
  - Store origin, field, occurrence, terminal, proof, and evidence path IDs.
  - Use a small transition policy. All unlisted transitions stop field identity.
- **Change 2 — Carry the projection through the strict transport path**
  - Add a separate field-lineage collection to the Route Totality contract.
  - Project it through `projectRouteTotality()`.
  - Validate every origin, occurrence, terminal, element, and relation reference.
- **Change 3 — Add the first occurrence inspector result**
  - Preserve the last exact origin as a local field focus.
  - Add a compact `Proven fields` section to the occurrence inspector.
  - Show the field label, proof status, field-read location, and terminal target.
  - Show nothing when no exact record matches the active origin and occurrence.
- **Verification**
  - Run `pnpm lint` and `pnpm typecheck`.
  - Exercise a route-root path shaped as
    `origin → source.name → intrinsic terminal`.
  - Confirm source proof opens at the exact field read.
  - Do not create or change tests.

### Desired end state

- Selecting one proven origin activates field focus.
- One occurrence inspector lists one exact field.
- The record reaches one exact render terminal.
- The DTO contains no definition-level field attachment.
- Unsupported relations produce no label.

## Milestone 2: Prove one component handoff

Extend the thin slice through one statically resolved component boundary. Keep
the work limited to exact JSX binding. Do not add general type or shape flow.

- **Change 1 — Add exact JSX prop binding evidence**
  - Resolve the component occurrence through its compiler-backed definition.
  - Resolve one static JSX prop to one exact component parameter member.
  - Emit a dedicated proven relation with source locations and endpoint IDs.
  - Reject ambiguous targets, dynamic props, rest props, and unresolved symbols.
- **Change 2 — Admit the new relation into the field policy**
  - Preserve origin and field identity only across the dedicated relation.
  - Keep the existing `component-prop` relation as a consumer handoff.
  - Preserve both facts without merging their display or meaning.
- **Change 3 — Show downstream continuity**
  - Extend the occurrence field record to the child terminal when proof exists.
  - Keep the caller occurrence and child occurrence records separate.
  - Keep source locations for both the prop handoff and downstream field read.
- **Verification**
  - Run `pnpm lint` and `pnpm typecheck`.
  - Exercise `<Child name={source.name}>` with `props.name` in the child.
  - Exercise `<Child user={source}>` with `props.user.name` in the child.
  - Confirm the terminal loses its field label when exact binding is removed.
  - Do not create or change tests.

### Desired end state

- One exact source field crosses one proven component boundary.
- The child occurrence and terminal show the field.
- Consumer handoff evidence remains separately visible.
- A name match alone cannot create the handoff.

## Milestone 3: Make identity loss honest and occurrence-safe

Widen the projection only after the direct and component-boundary slices work.
This milestone makes negative cases part of the product behavior.

- **Change 1 — Complete the transition policy**
  - Use the shared endpoint-aware transition classifier. Do not define a second
    relation policy.
  - Require one proven source, target, occurrence anchor, terminal anchor, and
    component-prop binding endpoint where that transition needs one.
  - A component-prop binding has one occurrence-specific binding element between
    one exact component-prop boundary and one exact parameter-rooted receiver.
    It has one unique occurrence anchor and one unique parameter evidence
    element. More than one candidate is `ambiguous-target`. No binding stops at
    the consumer boundary. Equal prop and parameter names are never proof.
  - Stop on partial proof, dynamic dispatch, ambiguous merges, packing, spreads,
    renames, derivation, transforms, and traversal limits.
  - Never resume a stopped field identity.
- **Change 2 — Add exact literal index labels**
  - Accept an index only through one proven `field-input` transition from the
    current exact receiver to one `index-read` element.
  - Accept only an `index-read` whose metadata contains one raw string or
    numeric literal. Do not read display text.
  - For a string literal, emit `kind: "string-index"` and the unescaped literal
    value.
  - For a numeric literal, emit `kind: "numeric-index"` and the base-10
    canonical integer string. Reject `NaN`, `Infinity`, negative zero,
    exponent-only ambiguity, and non-integer values.
  - Reject computed variables, template expressions, symbols, optional or
    dynamic keys with `dynamic-index`. Reject packing, spread, rename,
    derivation, and transforms with the existing bounded fail-closed frontier
    reason. Do not infer identity from a label.
- **Change 3 — Emit explicit field frontiers**
  - Record one bounded stop reason and location when field identity ends.
  - Keep downstream consumer handoffs available without a field label.
  - Keep context member paths outside this projection.
- **Change 4 — Protect occurrence identity**
  - Keep repeated calls to one definition independent.
  - Keep same-name fields from different origins independent.
  - Keep multiple-origin merges unlabeled for one selected origin.
  - Retain original occurrence IDs through hidden-node redirects.
- **Verification**
  - Run `pnpm lint` and `pnpm typecheck`.
  - Manually exercise repeated occurrences, equal field names, prop renames,
    object packing, a dynamic index, and a conditional merge.
  - Confirm each unsupported case keeps its handoff and drops its field label.
  - Do not create or change tests.

### Desired end state

- Every shown field has a complete exact identity path.
- Repeated occurrences do not share field records.
- Same-name fields do not create joins.
- Identity loss produces an explicit frontier and no downstream label.
- Context and consumer handoffs remain separate projections.

## Milestone 4: Restore the visible topology summary

Finish the Project 4.1 product result. The graph and inspector must make the
bounded evidence easy to scan without adding Project 4.2 source selection.

- **Change 1 — Add occurrence-level graph summaries**
  - Highlight exact field-lineage nodes and edges with the incumbent green
    source-path treatment.
  - Keep consumer handoffs blue and field frontiers amber.
  - Show compact proven field labels on occurrence nodes for the active origin.
  - Keep labels out of shared definition records.
  - Keep graph structure deterministic for Solid SSR.
  - Avoid field entities as separately selectable graph nodes.
- **Change 2 — Complete the inspector presentation**
  - Reuse the incumbent pale-green source-field section.
  - List proven fields in a compact aligned section.
  - Show field proof, terminal coverage, and exact source actions.
  - Show consumer handoffs and field frontiers in separate sections.
  - Use restrained backgrounds without decorative side rails.
- **Change 3 — Bound payload and layout work**
  - Deduplicate stable field records by exact identity.
  - Bound paths and frontiers with explicit omissions.
  - Avoid layout changes when the active origin only changes label visibility.
- **Verification**
  - Run `pnpm lint` and `pnpm typecheck`.
  - Compare the required before-and-after `/roster` screenshots.
  - Check one compact route and one larger route manually.
  - Confirm field focus survives occurrence inspection in the current session.
  - Confirm route changes clear stale field focus.
  - Do not create or change tests.

### Desired end state

- The graph summarizes proven fields per component occurrence.
- The inspector lists the same occurrence-bound fields with proof.
- Missing identity produces no label.
- The view remains compact and deterministic.
- Project 4.2 can later connect source selection and URL state to the same origin
  identity.

## Milestone 5: Independent product verification

Use a separate clean-room worker after implementation. Give it the user-visible
goal and routes. Do not give it a source-code walkthrough.

- **Change 1 — Run clean-room browser verification**
  - Start the product with
    `pnpm dev -- --root examples/bad-ish-solid`.
  - Use the Vite URL printed by that command.
  - Open Route Totality for `/roster` and select exact origins from the graph.
  - Check direct reads, one proven component handoff, and repeated occurrences.
  - Check same-name fields, renames, packing, dynamic indexes, and merged origins.
  - Treat navigation, label, selection, or inspector confusion as product evidence.
- **Change 2 — Close the implementation loop**
  - Route exact failures back to the responsible implementation worker.
  - Repeat clean verification after each focused repair.
  - Run final `pnpm lint` and `pnpm typecheck` after the product gate passes.
- **Change 3 — Request the test decision**
  - Ask whether focused analyzer, contract, and frontend tests should be added.
  - Run no tests and make no test changes before explicit approval.
  - After approval, add the agreed evidence and use `pnpm verify` as the final gate.

### Desired end state

- An independent worker confirms the required field-parity journey.
- Fail-closed cases remain unlabeled and understandable.
- Static checks pass.
- Test work remains an explicit user decision.

## Post-approval test plan

Do not start this section until Byron explicitly approves test work.

- Add `test/route-field-lineage.test.ts` for domain projection evidence.
  - Direct root property and nested property paths.
  - Same-prop JSX binding and object-carrier JSX binding.
  - Repeated occurrences and same-name origins.
  - Rename, destructuring, pack, spread, dynamic index, merge, and truncation
    frontiers.
  - Stable IDs and deterministic ordering across two analyses.
- Extend `test/api/contracts.test.ts` for strict field-lineage parsing.
  - Accept one valid attachment and frontier payload.
  - Reject unknown IDs, definition IDs, duplicate IDs, bad labels, unsorted
    terminals, discontinuous paths, and unavailable payloads with attachments.
- Add `test/frontend/route-totality-field-lineage-model.test.ts`.
  - Filter by exact origin ID and role.
  - Group by original occurrence ID.
  - Aggregate hidden-node summaries without changing record ownership.
  - Return the required empty and frontier states.
- Extend `test/frontend/trajectory-ui.test.tsx` only for the user-visible
  origin-focus, graph-summary, and inspector behavior.
- Run only focused checks while developing the approved tests.
- Run `pnpm verify` as the one final repository gate.

## Worker split

Run implementation workers in sequence because they share analyzer, contract,
and inspector boundaries. Use GPT-5.6 Luna at Max reasoning unless concrete
struggle requires escalation.

1. **`🧭 04 · First field slice`**
   - Own Milestone 1 across analyzer, contract, projection, and inspector.
   - Stop after the first end-to-end result and static checks.
2. **`🧭 05 · Field proof review`**
   - Perform a read-only review of the Milestone 1 proof policy.
   - Check relation direction, exact identity, occurrence ownership, and gaps.
3. **`🧭 06 · Exact component handoff`**
   - Own Milestone 2.
   - Use the proof review as its starting evidence.
4. **`🧭 07 · Fail-closed field paths`**
   - Own Milestone 3.
   - Preserve the two completed vertical slices.
5. **`🧭 08 · Field parity UI`**
   - Own Milestone 4.
   - Read `docs/design-preferences.md` before UI changes.
   - Follow the UI visual contract and capture its reference screenshots.
   - Do not introduce an unapproved visual surface.
6. **`🧭 09 · Field parity verification`**
   - Own Milestone 5 as an independent clean-room browser pass.
   - Avoid source inspection unless blocked.

The orchestrator owns all feedback loops. Send verifier evidence back to the
responsible worker. Repeat implementation and clean verification until the gate
passes or user input is required.

### Worker protocol

- Use the saved checkout. Do not create a worktree.
- Run workers sequentially because their file ownership overlaps.
- Each worker reads `AGENTS.md` and the relevant milestone before changes.
- Each worker inspects `git status` and preserves unrelated changes.
- On the `major-rewrite` branch, each implementation worker creates one small
  checkpoint commit after its milestone passes static checks.
- Before each commit, verify author and committer are
  `Byron Wall <byron@byroni.us>`.
- No worker changes tests or runs `pnpm verify` before explicit approval.
- Each implementation report includes changed files, supported examples,
  stopped examples, lint result, typecheck result, commit ID, and remaining
  omissions.
- The proof-review worker reports findings by severity and exact identity
  invariant. It makes no edits.
- The browser worker receives product goals, the dev command, `/roster`, and the
  acceptance matrix. It receives no source-code walkthrough.

## Below the cut line

- Field renames and destructuring rename history.
- Object packing, spreads, and complete shape transformations.
- Derived values and formatter output lineage.
- Conditional multi-origin alternatives.
- Dynamic property keys.
- Complete Project 6 type flow.
- Legacy source-picker and Route Totality selection unification.
- Field-specific URL persistence.
- Independently selectable field graph nodes.
- Automatic wrapper condensation.
