# Code Understanding Product Pillars

This document set turns the July 12, 2026 product transcript into an evidence-grounded product model and implementation sequence for `tsx-data-flow`.

The current behavior contract for the implemented route-level explorer lives in [Data trajectory product intent](../data-trajectory-intent.md).

The central conclusion is that the product needs one semantic evidence graph with several projections, not several unrelated visualizers. The same primitives should support repository orientation, route/request explanation, canonical data-shape tracing, interactive state explanation, render-variant inspection, and cleanup prioritization.

## Reading order

1. [Jobs and outcomes](01-jobs-and-outcomes.md) defines what users are trying to accomplish and how success is observed.
2. [Current capability audit](02-current-capability-audit.md) maps those jobs to code that exists today and records gaps without treating plans as implementation.
3. [Core semantic primitives](03-core-semantic-primitives.md) decomposes the product into the smallest reusable analysis facts.
4. [Product pillars](04-product-pillars.md) recomposes those primitives into coherent user-facing capabilities.
5. [Delivery sequence](05-delivery-sequence.md) orders vertical slices, dependencies, tests, and product gates.
6. [Reference scenarios](06-reference-scenarios.md) makes `wall-portfolio`, `visual-notes`, and Pluck executable acceptance fixtures.
7. [First vertical slice](07-first-vertical-slice-route-data-trajectory.md) is the executable plan for the first new visualization.

## Product thesis

The durable question is:

> What enters this application, how does it become what the user sees or changes, which conditions and representations govern that path, and where did avoidable complexity enter?

This breaks into two complementary zoom levels:

- **Application orientation:** identify entry points, subsystems, boundaries, routes, major data providers, component regions, and their connectivity.
- **Trajectory explanation:** follow one meaningful domain value through reads, transformations, state, conditions, rendering, interaction, writes, and reconciliation.

The overview is an index into trajectories. A trajectory is an evidence-backed path through the same model. A cleanup opportunity is a diagnosis over one or more trajectories. None should require a separate source of truth.

## First product bet

The first implementation will test a narrower thesis than the complete pillar set:

> Starting from a route, can a developer understand how persisted data intersects that route and becomes rendered geometry or content by inspecting a focused left-to-right trajectory?

The primary fixture is the `visual-notes` time-block route, from Prisma through `TimeBlockItem`, resource loading, optimistic read projection, overlap augmentation, geometry calculation, and rendered styles. Pluck's saved capture detail route is the robustness fixture for file/JSON persistence, larger shapes, contexts, and a larger component surface.

Interaction state is included only when it contributes to a selected rendered value. Full event, mutation, state-machine, and reconciliation visualization remains horizontal follow-on work.

## Status vocabulary

The audit uses four precise labels:

- **Implemented:** code computes and exposes the claimed semantic fact.
- **Partial/proxy:** a related fact exists, but it does not prove the requested meaning.
- **Planned only:** a repository document proposes the feature, but production code does not implement it.
- **Absent:** no production model or projection was found for the capability.

## Design constraints carried forward

- Show uncertainty and coverage; never imply a complete application model when only render paths were analyzed.
- Preserve compiler identities and source evidence. Names and formatted type strings are presentation, not identity.
- Treat ordinary transformations as facts. Promote only evidence-backed suspicious sequences into findings.
- Aggregate by shared upstream cause. Twelve affected sinks should often be one cleanup opportunity with a blast radius.
- Keep repository-scale views bounded through hierarchy, collapse, focus, and progressive disclosure.
- Support reads and writes. A view-only graph cannot explain an interactive application's full data lifecycle.
