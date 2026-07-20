# Data trajectory product intent

This document describes the product behavior the data trajectory explorer should preserve while the analyzer and UI continue to evolve. It is an intent contract, not a pixel specification or a promise that every TypeScript pattern is already supported.

## Product job

Help a developer choose one concrete persisted data value and understand how that value moves through a route: where it is loaded, which resource owns the handoff, which components carry it, which fields are read, which transforms act on it, and where it reaches rendering.

The display should answer questions such as:

- Is this the actual source used by the route, or merely another read in a reachable module?
- Does a component receive the full object, only an identifier, or a transformed projection?
- Which fields are genuinely read along this path?
- Is data passed through props, a resource, a context, or a helper?
- Where does static proof stop?

## Primary experience

- The component topology is the default view because it gives the best route-level orientation.
- A data-source picker selects a concrete read value, not a vague data category. Each option shows its origin, consumer/fetcher, readable type, fields, and location.
- Selecting a source materially changes the topology. Participating handlers, resources, components, and edges are emphasized; directly observed fields appear as green labels on the relevant components.
- Detailed paths remain available for inspecting individual source-to-render trajectories and evidence.
- Selecting a component opens an inspector with its incoming and outgoing relationships, source fields, transforms, render terminals, and data evidence.

## Evidence semantics

Static analysis is the primary truth. Do not invent a plausible path when a proven path is unavailable.

- Green edges and labels mean proven lineage for the selected source.
- Blue dashed edges mean resource loading or resource ownership. They do not imply field-level lineage.
- Gray edges describe component relationships.
- Field labels come from property reads on trajectories rooted at the selected source. A same-named field elsewhere in the route is not sufficient evidence.
- Transform counts include only transforms retained on source-rooted paths. Field-overlap candidates are not presented as if they acted on the selected value.
- “Activate source” is available only when a concrete persisted source key exists.
- “Inspect resource” selects a resource boundary without pretending to activate a source filter.
- When a path or field identity is not proven, the UI should say so directly and render no green evidence for that claim.

Removing information is preferable to showing a misleading fallback. In particular, avoid guessed contexts, nearest-component ownership, loose persistence nodes attached to the route root, or inferred source identity based only on field names.

## Source and resource identity

- Prefer the persistence read that actually contributes to a visible resource consumer over generic bootstrap or sibling reads found in the same reachable module.
- Resource ownership comes from the enclosing callable and the real `createResource`/`createAsync` fetcher signature.
- When the analyzer limits retained sources, reserve capacity for proven sources associated with visible resource handlers before filling remaining slots with general candidates.
- Preserve readable source identity in the UI. Show named types when available; otherwise show a compact structural type without compiler-only absolute import qualifiers.
- A returned field may appear in the source shape without appearing on the topology. Green labels represent consumed fields, not every field the source could return.

## Analysis behaviors worth preserving

The analyzer should retain lineage across common application patterns without allowing tracing to grow without bounds:

- Returned collections assembled with loops and mutations such as `push`, `set`, or `add` retain the ancestry of values inserted into them.
- Return dependencies survive intermediate bindings and `??`, `||`, and `&&` expressions.
- Constructed collections such as `new Map(source.map(...))` preserve the relevant input and projection fields.
- Resource identity survives a cross-file helper boundary when a resource-bearing argument is passed onward.
- Object arguments passed to helpers are resolved lazily by the property actually consumed. Reading `options.stageContext` must not eagerly expand every unrelated property in a large options object.
- Resource-return chains receive enough analysis priority to complete before unrelated route breadth exhausts declaration budgets.
- Performance is part of correctness: a more complete trace is not useful if ordinary repositories stall or exhaust the Node heap.

## Topology layout and interaction

- The graph should read as data moving from the upper-left toward the lower-right.
- Sources and contexts generally sit upstream of their consumers. Terminal children prefer the right or lower side of their parent; the upper-left quadrant is a last resort.
- Terminal and exclusively owned subtrees stay visually attached to their parent after the simulation settles.
- Node marks maintain visible clearance. Mark gap defines the desired empty space; collision controls how strongly that space is enforced.
- The source picker closes after selection, on click-away, and on `Escape`; `Escape` returns focus to the trigger.
- The `D` shortcut opens layout-debug controls as an overlay. Opening or closing it must not remount, resize, or push the graph canvas or inspector.
- Debug controls are product-development tools. Their exact values may change, but they must remain usable without corrupting the normal topology state.

## Honest incomplete states

The display is allowed to be incomplete, but it must be precise about the gap.

- A resource can be proven while its persisted source or returned render handoff is not.
- A source path can be proven while field identity is not established; in that case paths may highlight, but field labels remain absent.
- A returned source shape can contain fields that are never consumed on the selected render path.
- Multiple persisted inputs aggregated by one consumer may prevent the analyzer from assigning a downstream path to one input. Do not guess.
- Completeness is always scoped to the analyzer’s supported static patterns and retained budgets.

## Regression coverage philosophy

Tests should protect semantics rather than freeze the current presentation.

- Prefer pure model tests for source-rooted projection, field identity, transforms, terminals, resource participation, and layout relationships.
- Use small analyzer fixtures for language patterns that previously broke lineage or performance.
- Use focused component tests for interaction contracts such as source activation, resource inspection, popover dismissal, and debug-overlay mounting.
- Avoid large text snapshots, exact SVG coordinates, exact path counts from real external repositories, or assertions tied to incidental class ordering.
- Keep a small number of end-to-end analyzer fixtures that prove persistence → resource → helper/component → render behavior.

The goal is to catch a semantic regression while leaving room to improve the UI, tune layout, rename labels, add new analysis patterns, and change how evidence is presented.
