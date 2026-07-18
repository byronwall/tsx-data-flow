# Jobs and Outcomes

## Job 1: Establish an application-level mental model

When entering an unfamiliar repository, determine what kind of application it is, what it exists to do, and how its major systems relate without reading files one by one.

Desired outcomes:

- distinguish a server, CLI, client application, full-stack application, monorepo, and service collection;
- identify frameworks and communication technologies from evidence;
- see major subsystems and whether code organization corresponds to application organization;
- recognize entry points, network boundaries, persistence boundaries, render boundaries, and external integrations;
- compare the relative size and complexity of regions without assuming colocated code is connected code;
- expose incoherence: diffuse imports, cross-region coupling, oversized modules, and boundaries that do not align with folders.

Success means a user can give a short, accurate explanation of the application and point to evidence for it.

## Job 2: Inventory user-visible and machine-visible entry points

Determine the discrete ways execution enters the application and what each entry point can invoke.

Entry points include:

- web routes and route parameters;
- page, layout, middleware, API, and image/metadata routes;
- CLI commands and argument branches;
- server endpoints, workers, scheduled jobs, and message consumers;
- client network calls, actions, WebSockets, and other outbound operations.

For a web route, the useful explanation is not only “this file renders JSX.” It is:

```text
request/parameter
  -> route/layout chain
  -> server reads and loaders
  -> serialization or server/client boundary
  -> component hierarchy
  -> terminal DOM/JSX outputs
```

Success means every important entry point has a bounded, inspectable execution/data neighborhood and uncovered framework conventions are reported explicitly.

## Job 3: Navigate a repository at any scale

See a meaningful totality even when the repository contains millions of lines, then deliberately expand or isolate one region.

Required interaction semantics:

- hierarchical roll-up from repository to package/service, feature, file, symbol, and expression;
- stable aggregate edges crossing collapsed boundaries;
- expand a group in place while preserving context;
- isolate a group while retaining explicit incoming and outgoing boundary stubs;
- de-emphasize unrelated regions without losing orientation;
- keep the active surface near a comprehensible 30–50 items through semantic reduction, not arbitrary truncation;
- communicate omitted nodes, retained totals, coverage, and opacity.

Success means scale changes do not change the meaning of a node or edge; they only change aggregation level.

## Job 4: Follow canonical business data through the system

Start from a canonical domain type or persisted record and see how its identity and shape change on the way to a terminal use.

The user needs to distinguish:

- the canonical type and its definition;
- a compiler-linked derivative such as `Pick`, `Omit`, indexed access, or a generic projection;
- a structurally similar but disconnected mirror type;
- a runtime projection, pack, rename, normalization, grouping, aggregation, serialization, or parse;
- field loss, field derivation, identity loss, and later restoration;
- a legitimate narrow boundary from accidental shape churn.

Success means a user can answer “is this still the same business object?”, “which fields survive?”, “which fields were derived?”, and “will a canonical type change propagate here?” with compiler/source evidence.

## Job 5: Explain a concrete rendered value

Start at a terminal DOM/JSX property, text node, component input, or visual geometry value and trace backwards to every material contributor.

Examples:

- why this label has its displayed text;
- why this block has this `top`, `left`, `width`, and `height`;
- which database value, viewport scale, overlap calculation, and interaction state contribute;
- which helpers, contexts, resources, and conditions govern the value;
- where trace opacity begins.

Success means the path is expressed as ordered operations with source locations, input/output types or shapes, control dependencies, and uncertainty—not merely a bag of root labels.

## Job 6: Understand conditional render variants

Determine the meaningful ways a domain item can appear on screen and which state selects each variant.

Required distinctions:

- a single element whose fields/styles vary conditionally;
- mutually exclusive elements or component branches;
- repeated tests of the same discriminant;
- rest, dragging, resizing, loading, error, empty, and optimistic variants;
- one data object rendered simultaneously in several surfaces;
- parent contexts and resources feeding each variant.

Success means a user can enumerate variants, select one, and see the condition and data trajectory unique to it without mentally reconstructing JSX control flow.

## Job 7: Explain interactive read–modify–write–reconcile cycles

Follow a persisted value into UI state, through user interaction, back to a write boundary, and into refreshed or reconciled state.

The lifecycle is:

```text
canonical record
  -> query/load
  -> client representation
  -> derived render geometry/content
  -> interaction/event state
  -> optimistic projection
  -> action/API write
  -> persistence mutation
  -> refresh/revalidation/reconciliation
  -> rendered state
```

Success means the tool can show both the read path and write path, identify the mutation payload's relationship to the canonical type, and explain the reconciliation rule.

## Job 8: Diagnose architecture and data-flow smells

Find high-leverage cleanup opportunities grounded in observed paths rather than style preferences.

High-value diagnoses include:

- drop-then-recover identity or fields;
- disconnected mirror DTOs and repeated near-copy type declarations;
- repeated or conflicting normalization/defaulting;
- typed-to-opaque-to-typed transitions;
- premature grouping that complicates cross-group interaction;
- repeated conditional forks over one discriminant;
- prop/context relay and overly broad state ownership;
- high coupling across nominal subsystem boundaries;
- giant modules or regions whose multiple responsibilities are confirmed by graph participation.

Success means each finding states the evidence, affected trajectories, confidence, a disproof condition, and the smallest responsible boundary.

## Job 9: Separate complexity from wrongdoing

See real computational complexity—including legitimate geometry, parsers, and transformation pipelines—without receiving generic “simplify” advice merely because a path is long.

Success means:

- ordinary transformations remain browsable facts;
- the tool distinguishes semantic work from representation churn;
- incomplete evidence is visibly incomplete;
- a long but coherent path is explainable without being classified as defective;
- recommendations identify a violated invariant, repeated work, lost identity, or avoidable reconciliation burden.

## Job 10: Hand analysis to a human or coding agent

Turn exploration into a bounded work packet.

A useful packet contains:

- the application/feature context;
- selected entry point or terminal;
- canonical identity and path;
- exact source locations;
- before/after shape and conditions;
- affected sinks/writes and blast radius;
- unknown boundaries;
- proposed invariant and acceptance test.

Success means another agent can act without rediscovering the repository and can re-run the analysis to verify improvement.

