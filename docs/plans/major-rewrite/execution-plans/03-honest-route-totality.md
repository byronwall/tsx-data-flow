# Project 3 — Honest Route Totality

## Outcome

Show every proven source, component occurrence, boundary, and terminal for one
route without false joins or arbitrary branch removal.

This project turns the single-path marshmallow into the holistic route view.

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

