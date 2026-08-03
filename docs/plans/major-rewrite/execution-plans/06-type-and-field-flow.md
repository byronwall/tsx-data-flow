# Project 6 — Type and Field Flow

## Outcome

Let a developer see how a selected value's type and fields are preserved,
selected, packed, renamed, derived, lost, and restored.

This project should begin only after the route cutover review selects type flow
as the next highest-value product.

## Milestone 1: Explain one field transformation end to end

Start with one route path that selects and repacks a small known domain object.
Do not build a universal type explorer first.

- **Change 1 — Select one canonical type and terminal**
  - Use a real path with a named source shape, one field selection, one object
    pack, and one rendered use.
  - Record the compiler identity of the canonical type and selected fields.
- **Change 2 — Add shallow value shapes**
  - Represent primitive, object, array, tuple, union, and opaque shapes.
  - Keep recursion shallow and referenced.
  - Remove compiler-only absolute import noise from display labels.
- **Change 3 — Add one field provenance record**
  - Link each output field to preserved, renamed, derived, defaulted,
    aggregated, introduced, or unknown inputs.
  - Require syntax or checker evidence for the claim.
- **Change 4 — Show the transform in focused detail**
  - Open the transform from the route inspector.
  - Show before shape, operation, after shape, field mappings, and code.

### Desired end state

- One selected route value has a proven before-and-after shape.
- A field rename or pack retains exact upstream field evidence.
- Unknown field lineage remains explicit.
- The route overview remains unchanged until detail is requested.

## Milestone 2: Cover the common shape operations

Extend the evidence ledger only through operations found in representative
route paths.

- **Change 1 — Add selection and construction operations**
  - Cover nested reads, destructuring, pick, omit, pack, spread, and rename.
- **Change 2 — Add collection operations**
  - Cover map, filter, index, flatten, group, and aggregate.
  - Distinguish list-to-item, item-to-list, and many-to-one effects.
- **Change 3 — Add representation boundaries**
  - Cover parse, validate, serialize, fallback, and type narrowing.
  - Mark typed-to-opaque and opaque-to-typed transitions.
- **Change 4 — Preserve identity effects**
  - Classify preserved, projected, lost, restored, and unknown identity.
  - Avoid marking a spread augmentation as a disconnected mirror.

### Desired end state

- Common pluck and pack operations have evidence-backed field effects.
- Collection cardinality changes are visible.
- Parsing and serialization boundaries retain opacity.
- Long legitimate transforms remain facts, not automatic findings.

## Milestone 3: Add a type-first projection

Let the user switch from component occurrences to value shapes and type changes
within the same selected slice.

- **Change 1 — Project value and transform nodes**
  - Use type or shape snapshots as the main marks.
  - Keep source, boundary, and terminal context available.
- **Change 2 — Add field-level expansion**
  - Start with compact shape summaries.
  - Expand to changed and participating fields before full shapes.
- **Change 3 — Link back to route occurrences and code**
  - Select a type transform to show every participating occurrence.
  - Open exact code in the shared inspector.
- **Change 4 — Measure visual density**
  - Compare node, field, and edge counts on a small object and a large Pluck
    object.
  - Preserve field totals when details collapse.

- **Spike — Choose the primary type visual**
  - Decision required: node chain, bundled field edges, subway lines, or another
    compact graph form.
  - Evidence to gather: comprehension on field rename, scalar narrowing, list
    aggregation, and large-object projection.
  - Fallback: use compact before-and-after nodes with expandable field tables.

### Desired end state

- The type lens uses the same evidence slice as the route lens.
- A user can follow canonical identity and field changes.
- Large shapes remain compact until expanded.
- Code and component context remain one click away.

## Milestone 4: Detect linked and disconnected type churn

Use the new evidence to reveal high-value questions without making generic
complexity claims.

- **Change 1 — Distinguish compiler-linked derivatives**
  - Recognize `Pick`, `Omit`, indexed access, generics, and proven projections.
- **Change 2 — Surface disconnected structural mirrors**
  - Require structural similarity plus missing compiler lineage.
  - Present this as evidence for review, not automatic defect proof.
- **Change 3 — Reveal drop-and-recover paths**
  - Show where an object narrows to a scalar and later expands through a lookup.
  - Retain the lookup boundary and identity proof.
- **Change 4 — Group repeated transformations**
  - Aggregate repeated equivalent operations by resolved identity and fields.
  - Keep every call site available.

### Desired end state

- The product separates linked projections from disconnected mirrors.
- Drop-and-recover paths are visible.
- Repeated transforms have shared-cause evidence.
- No recommendation appears without a violated invariant or disproof rule.

## Project decision gate

Use the type lens on one clean and one messy real path.

Proceed to diagnosis only if users can answer:

- Is this still the same domain value?
- Which fields survive?
- Which fields change names or meaning?
- Where is identity lost?
- Will a canonical type change propagate here?

## Below the cut line

- Runtime value samples
- Full recursive compiler types
- Automatic type cleanup
- Schema migration generation
- Cross-language type lineage
- Automated tests without separate approval

