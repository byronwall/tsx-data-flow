# Product Pillars

## Pillar 1: Application Atlas

Purpose: answer “what is this application and how is it organized?”

Inputs:

- entry-point adapters;
- framework/config evidence;
- boundaries and external systems;
- semantic hierarchy and aggregate edges;
- import/call/render/data participation metrics;
- code size and finding overlays.

Surfaces:

- application summary with detected runtime/framework evidence;
- hierarchical map with switchable grouping schemes;
- entry-point inventory;
- source, boundary, transform, state, render, write, and external landmarks;
- coverage/opacity panel;
- expand and isolate interactions with stable boundary stubs.

It must not claim:

- that folder layout equals architecture;
- that a render root is a route;
- that missing edges mean no runtime connection;
- that one inferred feature clustering is authoritative.

The atlas is not the first full implementation target. The first slice uses a minimal route inventory as an entry selector for one data-trajectory visualization. A broader hierarchical application atlas follows after that trajectory proves useful.

## Pillar 2: Canonical Data Lineage

Purpose: answer “what business data is this, and what happened to its identity and shape?”

Inputs:

- compiler identity;
- normalized value shapes;
- declared type-derivation edges;
- field provenance;
- semantic operations;
- database/API/serialization boundaries.

Surfaces:

- important domain-type inventory;
- canonical versus derivative/mirror classification;
- field-preservation matrix;
- selected trajectory ledger;
- affected routes, renders, and writes;
- shape-change findings grouped by canonical root.

Core diagnoses:

- disconnected near-copy type;
- drop then recover;
- repeated normalize/default;
- typed → opaque → typed;
- rename/churn without semantic effect;
- write payload drift from canonical type.

Guardrail: structural similarity is a search clue, not proof of shared identity or a defect.

## Pillar 3: Render and Interaction Explainer

Purpose: answer “why does this exact thing appear here, and how does interaction change it?”

Inputs:

- DOM/JSX/component terminals;
- backward and forward trajectories;
- predicates and variants;
- state cells/transitions;
- structured geometry operations;
- component/render hierarchy.

Surfaces:

- select a terminal in source, inventory, component map, or DOM-oriented tree;
- contributor graph grouped into canonical data, layout/viewport, interaction state, and constants;
- ordered value/shape ledger;
- variant switcher for rest/drag/resize/loading/error/empty states;
- parent contexts/resources and terminal duplication;
- coordinate/geometry explanation for style sinks.

Geometry should be explained as named stages:

```text
domain time -> visible segment -> day/lane -> overlap slot
  -> pixel/percent geometry -> conditional variant -> style terminal
```

Guardrail: do not infer runtime pixels when static evidence only proves formulas and contributors.

## Pillar 4: Lifecycle and Mutation Explorer

Purpose: answer “how does a user action become durable data and return to the screen?”

Inputs:

- event terminals as entry points;
- forward call/data analysis;
- state transitions;
- action/fetch/API adapters;
- write terminals;
- canonical mutation payload lineage;
- invalidation, refresh, optimistic, confirmation, and rollback relationships.

Surfaces:

- read–render–event–write–reconcile loop;
- optimistic versus authoritative state lanes;
- mutation payload field provenance;
- affected renders while pending and after confirmation;
- missing/ambiguous reconciliation markers.

Core diagnoses:

- optimistic state cannot be matched to server identity;
- write path reconstructs a canonical object through disconnected DTOs;
- server confirmation and optimistic overlay use conflicting defaults;
- UI ownership/grouping makes cross-group mutation coordination costly;
- mutation invalidates or refreshes an unexpectedly broad surface.

Guardrail: static order is “possible/declared flow” unless framework semantics prove sequencing.

## Pillar 5: Architecture and Cleanup Advisor

Purpose: turn evidence from the other pillars into prioritized, bounded work.

Inputs:

- all trajectory/finding facts;
- semantic group crossings;
- common-root reachability;
- file/module size;
- repeated forks, relays, helpers, defenses, opacity;
- before/after baselines.

Surfaces:

- one cleanup opportunity per shared cause;
- blast radius across routes, files, renders, and writes;
- evidence/disproof/unknown sections;
- recommended invariant and responsible boundary;
- work packet export;
- reanalysis comparison.

Priority should combine:

- evidence strength;
- user-visible or mutation reach;
- number of affected trajectories;
- boundary centrality;
- fix locality;
- regression risk;
- opacity penalty.

Guardrail: do not rank a path highly only because it is long or uses many operations.

## Shared interaction grammar

All pillars should use the same verbs:

- **Select:** inspect one entity/value/terminal.
- **Trace upstream/downstream:** build a trajectory.
- **Expand:** replace one aggregate with children.
- **Collapse:** roll children into an exact aggregate.
- **Isolate:** retain a chosen region plus explicit boundary stubs.
- **Compare:** align two analyses, shapes, variants, or trajectories.
- **Promote to work packet:** freeze evidence and acceptance criteria.

This consistency is a product primitive: users should not have to learn a different graph language for routes, types, components, and mutations.

## Resolved visualization direction

The initial visualization uses two coordinated scales:

1. **Route context:** a compact route-centered map shows the selected route, its shell/component region, intersecting persistence/domain types, and representative render terminals. It is an orientation and selection surface, not a universal graph.
2. **Selected trajectory:** a left-to-right ordered flow shows how one value moves from source through semantic operations to rendered sinks.

Selection retains the context map and fades unrelated content. Isolation is an explicit user action. In isolation mode, retain relevant contributors/consumers and summarized inbound/outbound boundary nodes.

Expanding a trajectory node replaces it in place with its children. Opening a separate focused canvas remains a distinct action and is not required for the first slice.

Data flow is always the primary edge meaning. Component hierarchy, calls, context jumps, and state reads appear only when needed to explain continuity of the selected value. The first slice does not provide a general call graph, control-flow graph, state machine, or sequence diagram.

### Semantic operation versus source expression

The two are related but should remain distinct:

- A **semantic operation** is the user-facing explanation of a value transition: “load weekly blocks,” “overlay optimistic times,” “group by day,” “assign overlap slot,” or “convert dates to geometry.” It may summarize several syntax nodes or a helper call.
- A **source expression** is the exact compiler/source evidence implementing all or part of that operation: a call expression, object spread, property access, conditional, or style field.

The default visible node is a semantic operation. Its compact label names the input/output value and effect. Hover shows a quick evidence preview. Selection opens a persistent inspector with types, fields, identities, exact expressions, source locations, and trace completeness. Expansion replaces the operation with its ordered source-expression children when that adds useful detail.

### Progressive disclosure

- At overview scale, show short operation and value labels only.
- As space or zoom permits, add type name, operation kind, and field-count/change summaries.
- Hover or keyboard focus shows a quick peek.
- Selection populates the persistent inspector.
- Source opens in a modal/drawer so the visualization and its URL state remain intact.

All durable exploration state should be URL-encoded: selected route, trajectory, entity/operation, expansion set, isolation, grouping/lens, filters, and viewport when useful. A refresh against unchanged analysis should restore the same view without a visible reset.
