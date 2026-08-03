# Project 8 — Read, Write, and Reconcile

## Outcome

Follow one persisted value into rendering, through user interaction, back to a
write, and into refreshed or reconciled state.

This project closes the data lifecycle. It should start with one concrete
interaction, not a general state-machine model.

## Milestone 1: Trace one event to one external effect

Choose one small interaction whose handler performs a clear write or request.

- **Change 1 — Promote event handlers from render metadata**
  - Identify the selected handler, captured values, and trigger occurrence.
  - Keep event control edges distinct from data edges.
- **Change 2 — Trace forward through the handler**
  - Follow arguments, local state, payload construction, helper calls, and the
    first external effect.
  - End at a write, request, message, or explicit gap.
- **Change 3 — Show the write path beside the read path**
  - Reuse the route scope and evidence model.
  - Distinguish read, interaction, write, and external boundaries.

### Desired end state

- One rendered control connects to one event handler and effect.
- The write payload has proven contributors.
- Unsupported dynamic dispatch becomes a gap.
- The existing read trajectory remains intact.

## Milestone 2: Relate the write payload to canonical data

Use type and field evidence where available to explain what the interaction
changes.

- **Change 1 — Identify the affected record or external identity**
  - Preserve canonical ID evidence through scalar and object transitions.
- **Change 2 — Map payload fields**
  - Show preserved, edited, introduced, omitted, and unknown fields.
  - Distinguish partial updates from full replacements.
- **Change 3 — Mark side-effect ownership**
  - Identify which system owns the mutation after the boundary.
  - Stop at an external consumer when no in-repository implementation exists.

### Desired end state

- A user can state which domain value the interaction updates.
- Payload fields link back to rendered or interaction values.
- Partial update semantics are visible.
- External ownership is explicit.

## Milestone 3: Trace one optimistic reconciliation loop

Use the `visual-notes` time-block path or another concrete optimistic update.

- **Change 1 — Model the selected state cells**
  - Identify authoritative resource state, optimistic state, and interaction
    state.
  - Avoid a universal state model beyond the selected case.
- **Change 2 — Record the chosen transitions**
  - Trace optimistic write, action or request, authoritative refresh, and
    retention or removal of the optimistic entry.
- **Change 3 — Join the lifecycle to rendered output**
  - Show how rest or drag geometry changes before and after reconciliation.
  - Mark static uncertainty about runtime order.

- **Spike — Define static claims about time**
  - Decision required: which ordering claims static analysis may present.
  - Evidence to gather: explicit awaits, callbacks, resource invalidation, and
    framework semantics.
  - Fallback: show transition dependencies without claiming runtime order.

### Desired end state

- One read-modify-write-reconcile loop is understandable.
- Optimistic and authoritative values remain distinct.
- Rendered consequences link to state transitions.
- Runtime order is not invented.

## Milestone 4: Add lifecycle-focused investigation

Make the full loop usable without drawing every state edge by default.

- **Change 1 — Add lifecycle mode**
  - Start from a selected terminal, event, state cell, or write.
  - Keep the route overview available as context.
- **Change 2 — Add variant and condition evidence**
  - Distinguish resting, dragging, loading, error, and optimistic variants where
    proven.
  - Show which variants coexist or exclude each other.
- **Change 3 — Add focused code navigation**
  - Order code excerpts by dependency or explicit transition.
  - Keep gaps and framework assumptions visible.

### Desired end state

- A user can inspect a complete selected lifecycle.
- Read, interaction, write, and reconciliation stages remain distinct.
- Conditions and variants explain rendered differences.
- The default route graph remains component-first.

## Project decision gate

The product should explain one real optimistic flow without relying on a source
walkthrough. Stop if static evidence cannot support the claimed lifecycle.

## Below the cut line

- General state machines
- Runtime event timelines
- Distributed transactions
- Rollback synthesis
- Mutation code generation
- Automated tests without separate approval

