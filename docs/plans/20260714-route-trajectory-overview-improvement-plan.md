# Route Complexity and Trajectory Overview Plan

This plan responds to the July 14 route-visualization feedback and the subsequent product decisions. The primary job is now explicit:

> Give a developer a visual overview of route complexity from persisted source methods to render sinks, then let them inspect every trajectory contributing to that complexity.

The intended journey is:

```text
all routes + concrete source methods + route complexity
  -> compare and choose a route
  -> see all source-to-sink trajectories for that route
  -> follow shared component structure and transformation junctions
  -> inspect the exact source behind a suspicious step
```

The current implementation starts too late in that journey. It restores or chooses one route, hides the route inventory in selectors, and presents one semantic-stage evidence sequence. The next implementation should preserve its evidence inspector and source verification while replacing its entry and route-detail models.

## Product decisions

1. **The overview optimizes for route complexity.** Its first job is to help a developer see which user-facing routes have the most source-to-sink processing. A future mode may optimize for searching for a known source, component, or value, but that is not required for the first proof of concept.

2. **The primary complexity metric is total path steps.** For a route with trajectories `P`, route complexity is initially:

   ```text
   totalPathSteps = sum(step count for each trajectory in P)
   ```

   Because shared work is counted once per trajectory, also expose `uniqueStepCount` and `trajectoryCount`. This prevents two routes with the same total from looking equivalent when one has one long path and the other has many repeated paths.

3. **Defaults, fallbacks, and normalizations are the secondary complexity signal.** Count operations capable of substituting, normalizing, or selecting a different value. This includes explicit defaults, fallback branches, conditional selections, nullish substitutions, and normalization boundaries. Show the count beside total steps; do not hide it inside a weighted score.

4. **User-facing TSX routes are the default scope.** Provide a visible toggle for **Pages**, **API**, and **All**. API routes remain important because pages may consume them and external clients such as CLIs may use them directly. When a page-to-API relationship is supported by evidence, show the API route as an intermediate boundary between the page and its persisted source method.

5. **A shared source means the same concrete persistence-touching method.** The source identity is the function or server handler that actually calls Prisma, reads disk, or crosses another supported persistence boundary. Two route call sites are not the same source merely because they access the same model or return similarly named data.

6. **The component tree should attempt to reach every terminal.** Traverse first-party component containment and supported prop/context handoffs to terminal render nodes. When a subtree is too large, collapse it at a meaningful parent, show its hidden component/trajectory counts, and allow the user to reveal it.

7. **Common display terminals may be collapsed, but final value extraction remains visible.** Strong collapse signals are high reuse, location in a conventional UI/design-system path, minimal internal logic, and pass-through/display-only behavior. The object-to-scalar or field-selection step that supplies the displayed value remains visible even when the terminal component itself is summarized.

8. **A route has multiple trajectories, and the product should represent all of them when possible.** Do not expose only a capped sample. At the expected scale, render all trajectories through merged shared prefixes/suffixes and collapsed terminal families rather than drawing each trajectory as an independent duplicated line.

9. **Refresh should restore broad investigation state; sharing is out of scope.** Persist route kind, selected route, selected source or trajectory, overview mode, filter, and sort. Restoring every expanded/collapsed subtree is optional. Losing one local disclosure choice is acceptable; requiring three or four actions to reconstruct the investigation is not.

10. **Design for 20–100 routes, 50–200 concrete source methods, and roughly 100–2,000 trajectories.** The overview should summarize all routes without mounting every detailed trajectory. A selected route may show hundreds of logical trajectories, but shared graph structure, progressive expansion, and rendering limits must keep interaction immediate.

## Terms and metrics

Use these terms consistently in analysis, DTOs, interface copy, and tests.

### Trajectory

A trajectory is one statically supported source-method-to-render-sink path. It contains ordered, evidence-backed steps. A trajectory may end at an explicit unknown boundary when unsupported code prevents continuation, but it must not bridge that gap by semantic-stage order, filename similarity, or import reachability.

### Step

A step is a meaningful value transition or boundary crossing, not every AST node. Initially count:

- concrete persistence method;
- page/API/query/resource boundary;
- first-party call or return handoff;
- component prop or context handoff;
- collection element mapping;
- project/select/augment/merge/derive/normalize operation;
- default/fallback/conditional substitution;
- scalar or field extraction;
- terminal render sink.

Several expressions implementing one meaningful transition count as one collapsed step and remain expandable as source evidence.

### Route complexity

The overview exposes an explainable vector rather than one opaque score:

| Metric | Meaning | Default emphasis |
| --- | --- | --- |
| Total steps | Sum of step counts across all retained trajectories | Primary sort and visual magnitude |
| Trajectories | Number of source-to-sink paths | Primary context |
| Unique steps | Deduplicated steps in the route graph | Shows shared work versus duplication |
| Substitutions | Defaults, fallbacks, selections, and normalizations | Secondary warning signal |
| Sources | Distinct concrete persistence methods | Source coupling context |
| Unknown gaps | Unsupported or opaque handoffs | Trust/coverage context |

Do not rank routes by raw import-reachable component or JSX-site counts. Those may describe scope, but they are not path complexity without participation evidence.

## Weakest or least-clear parts

### 1. Current data cannot calculate the chosen complexity metric truthfully

The current analyzer discovers expressions independently, sorts them by semantic stage, leaves operation inputs unlinked, and sets `handoffsProven` to false (`src/analysis/route-data.ts`, around lines 133–205). It currently produces one partial evidence sequence per route rather than a set of proven source-to-sink paths.

The dumb implementation would multiply the current operation count by the terminal count and call the result total path steps. That would manufacture paths and reward routes with larger terminal samples.

The MVP must first prove a narrow set of handoff patterns and calculate complexity only from those paths. Unsupported gaps remain incomplete trajectories and contribute an explicit unknown count.

### 2. Rendering every trajectory literally will recreate the failed world map

At 100–2,000 trajectories, independent polylines and repeated operation cards will overwhelm the overview and obscure shared work. “Show all trajectories” should mean all trajectories are represented and recoverable, not that every duplicate segment is separately painted at once.

The selected-route model should be a DAG with shared steps stored once. The UI may collapse shared trunks, repeated terminal families, and oversized component subtrees as long as it shows truthful hidden trajectory counts and makes them revealable.

### 3. Concrete source-method identity does not yet exist at repository scope

Route-scoped operation and value keys correctly avoid collisions in detail, but they cannot reveal that several pages or API routes reach the same persistence method. Prisma model identity alone is also insufficient under the chosen product definition.

Add a canonical source-method identity based on the resolved function symbol and defining file/span. Direct persistence calls without an enclosing first-party method use a stable synthetic call-site identity. Preserve route-scoped operation identities separately.

### 4. Page/API relationships are not represented

Classifying route files as page or API is only the first step. The valuable case is a page consuming an API route that then calls a source method. Without a supported page-to-API edge, showing both route kinds together implies relationships the analyzer has not proven.

The MVP should support the most common statically visible calls in the reference repositories, such as literal internal `fetch` URLs, directly imported server handlers, and supported query/tRPC procedure references. Unsupported dynamic routing remains unlinked and reported as an omission.

### 5. Current component context is bounded and terminal-capped

The current context view shows route-module JSX plus a ranked terminal sample and explicitly disclaims completeness (`RouteContextMap.tsx`, especially lines 6–16). The DTO also carries a terminal selection limit. That is incompatible with the decision to represent all trajectories and attempt a complete component tree.

The analyzer needs participation reasons and transitive first-party component containment. Remove sampling from the logical result; any rendering cap must be a reversible frontend disclosure state with truthful totals.

### 6. Common-component collapse needs explainable rules

Path frequency and a `components/ui` location are useful hints but cannot alone prove a component is uninteresting. A common component may own the exact formatting or fallback under investigation.

Use a conservative heuristic for the MVP. Never collapse a component that owns a transformation, substitution, opaque boundary, or selected terminal expression. Show why a family was collapsed and provide one-click reveal.

### 7. The existing acceptance test begins after the key product decision

The current walkthrough names `/time-blocks` or `/captures/[captureId]` before the user enters the visualization. It therefore cannot validate whether route complexity helps an unfamiliar developer choose what to inspect.

The new MVP study must begin at the all-route overview without naming a route.

## Immediate proof of concept / MVP

The MVP should be one vertical slice that can be implemented and evaluated without first solving every framework, persistence adapter, or graph-layout problem.

### MVP product surface

#### 1. Route complexity atlas

Make the initial Data Trajectories screen an aligned, scrollable atlas rather than a preselected route detail.

Each route row contains:

```text
SOURCE METHODS | ROUTE | TOTAL STEPS | PATHS | UNIQUE | SUBSTITUTIONS | GAPS
```

- Default to **Pages** and sort by **Total steps**, descending.
- Provide visible **Pages / API / All** toggles.
- Use a proportional bar or density strip for total steps so complexity is visually comparable without reading every number.
- Show concrete source-method chips on the left. Selecting one highlights every route using that method.
- Show page-to-API intermediaries when proven.
- Keep all route rows visible or virtualized; do not put the inventory back into a select.
- Clicking a route opens its trajectory/component detail while retaining atlas filters, sort, and scroll.

This table-shaped atlas is intentionally the first POC. It handles 20–100 routes and 50–200 sources more predictably than a freeform node graph while still making sources and complexity visible together.

#### 2. Selected-route trajectory graph

For one selected route, show:

- concrete source methods at the left;
- a nearly complete nested first-party component hierarchy in the center;
- terminal render families at the right;
- operation markers attached to the component/helper/boundary that owns them;
- all logical trajectories represented through shared graph segments;
- per-trajectory step and substitution counts;
- hidden trajectory/component counts on every collapsed group.

Default the detail to a merged graph, not hundreds of independent rows. Provide a **Trajectories** list/table beside or below the graph for exact enumeration, sorting, and selection. Selecting a trajectory highlights its source-to-sink slice without changing layout.

Operation markers should distinguish read, boundary, project/select, augment/merge, derive/normalize, fallback/default, field extraction, render, and unknown. Color is a redundant cue; shape/label and accessible text carry the same meaning.

Reuse the existing persistent inspector, evidence expansion, source modal, isolation behavior, and work-packet action.

### MVP supported analysis

Implement enough real handoff tracing to make one complete route useful in both `visual-notes` and Pluck:

1. resolved first-party function call arguments, parameters, returns, and call results;
2. Prisma and file-read call to enclosing source method identity;
3. SolidStart query and Solid resource result/accessor handoffs;
4. component prop producer to consumer;
5. context provider to consumer for supported direct patterns;
6. collection `.map`/`.flatMap` element bindings;
7. property reads, object literals/spreads, and scalar extraction;
8. nullish/default/fallback/conditional selection;
9. JSX child/attribute/style sinks;
10. transitive first-party component containment to retained sinks.

Do not block the MVP on dynamic dispatch, arbitrary framework routing, mutation/write tracing, runtime branch frequency, or perfect common-component classification.

### MVP data model

Add repository-level source and route-complexity summaries plus a shared route graph:

```ts
type SourceMethodSummary = {
  key: string;
  label: string;
  kind: "prisma" | "file" | "validated-json" | "other";
  file: string;
  line: number;
  routeKeys: string[];
};

type RouteComplexitySummary = {
  routeKey: string;
  routeKind: "page" | "api";
  sourceMethodKeys: string[];
  trajectoryCount: number;
  totalPathSteps: number;
  uniqueStepCount: number;
  substitutionStepCount: number;
  unknownGapCount: number;
};

type RouteTrajectoryGraph = {
  routeKey: string;
  nodes: TrajectoryStep[];
  edges: ProvenHandoff[];
  trajectories: Array<{
    key: string;
    sourceMethodKey: string;
    terminalId: string;
    stepKeys: string[];
    substitutionStepCount: number;
    completeness: "complete-for-supported-scope" | "partial";
  }>;
};
```

Every edge must retain exact evidence and confidence. Complexity summaries are derived from `trajectories[].stepKeys`, never calculated independently.

### MVP state restoration

Persist these broad choices in the URL or browser-local workspace state:

- route kind: Pages/API/All;
- complexity sort;
- text/source filter;
- selected route;
- selected source method or trajectory;
- atlas versus route-detail mode.

Component subtree expansion and every individual trajectory disclosure may reset. If the selected route or trajectory disappears after refresh, retain the atlas scope/filter and fall back to the route row with a quiet notice.

### MVP implementation sequence

1. **Define and test path semantics.** Add a synthetic fixture with two sources, two routes, one shared source method, multiple sinks, a fallback, a normalization, and a deliberately unsupported gap. Lock expected trajectory step lists and route metrics before UI work.
2. **Add source-method identities and proven handoff edges.** Implement the supported adapters above and retain exact evidence for each edge.
3. **Assemble trajectory DAGs and complexity summaries.** Enumerate source-to-sink paths with cycle guards and budgets, deduplicate identical step sequences, and derive route metrics.
4. **Extend strict API contracts and projections.** Put atlas summaries in the workspace response; fetch the selected route graph as detail. Do not put layout, CSS, or URL state in DTOs.
5. **Build the route complexity atlas.** Add pure frontend filter/sort/selectors and a focused atlas component. Make it the dialog's initial mode.
6. **Build the merged route graph and trajectory list.** Reuse the inspector and source modal; attach operation markers to component/helper ownership.
7. **Add conservative subtree and common-terminal collapse.** Preserve logical trajectories and show hidden counts.
8. **Add bumpless restoration and loading behavior.** Route/source/trajectory selection must not trigger full reanalysis or reset the atlas.
9. **Validate on the two reference repositories.** Measure analysis time, summary payload, route-switch time, rendered node count, and user comprehension before broadening adapters.

Keep modules focused:

```text
src/analysis/route-data-source-methods.ts    canonical persistence method identity
src/analysis/route-data-handoffs.ts          supported value handoff evidence
src/analysis/route-data-trajectories.ts      DAG/path assembly and complexity metrics
src/api/projections/route-data.ts            semantic atlas/detail DTO projection
src/frontend/src/overview/RouteAtlas.tsx      atlas composition only
src/frontend/src/overview/route-atlas-model.ts pure filter/sort/highlight selectors
src/frontend/src/overview/RouteGraph.tsx      selected-route graph composition
src/frontend/src/overview/route-graph-model.ts collapse/layout/trajectory selectors
```

Exact filenames may change, but do not fold new aggregation, graph shaping, and browser interaction state into `DataTrajectoryDialog.tsx` or `RouteTrajectoryWorkspace.tsx`.

### MVP acceptance test

Start an unfamiliar developer at the atlas without naming a route. Within five minutes they should be able to:

1. identify the three most complex page routes by total steps;
2. explain whether each is complex because of long paths, many paths, or both;
3. identify a concrete source method shared by multiple routes;
4. switch to API routes and recognize a proven page-to-API relationship where available;
5. select one route and see all retained trajectories represented;
6. identify a fallback/default/normalization-heavy trajectory;
7. trace that trajectory through its component hierarchy to a terminal value;
8. reveal the exact source evidence for one transformation;
9. distinguish a proven handoff from an unknown gap;
10. refresh and recover the broad investigation with at most one disclosure click.

The MVP is successful only if the complexity numbers reconcile exactly with the trajectory list and graph. It fails if terminal sampling hides trajectories, if stage order is presented as data flow, or if a route appears complex merely because it imports a large subtree.

## After the MVP

Expand only after the atlas changes how developers choose a route to inspect:

1. add more framework, API-client, persistence, prop, and context adapters;
2. improve common-component classification with observed project conventions;
3. add a second overview mode optimized for finding a known source/component/value;
4. add aggregation controls for unique work versus repeated path work;
5. add durable per-project display preferences if URL restoration becomes unwieldy;
6. evaluate a spatial source-route map only if the aligned atlas hides meaningful clusters;
7. add event/write/reconciliation trajectories separately.

Sharing, collaboration, cross-revision comparison, automatic smell diagnosis, and user-authored graph layout remain out of scope.

## Verification

Add focused tests for:

- canonical source-method identity shared across page and API routes;
- false-positive prevention for two methods touching the same Prisma model;
- proven argument/return, prop, context, resource, and collection handoffs;
- path enumeration, deduplication, cycle/budget handling, and unknown gaps;
- exact `totalPathSteps`, `uniqueStepCount`, and substitution counts;
- complete logical trajectory retention through collapsed UI groups;
- page/API/All filtering and complexity sorting;
- route/source highlighting and selected-trajectory focus;
- broad state restoration with optional collapse-state loss;
- 100 routes, 200 sources, and 2,000 trajectories without eager detail loading.

After implementation changes run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Record analysis and interaction timings against `visual-notes`, Pluck, and the synthetic maximum-scale fixture.

## Most likely bad outcome

The most plausible failure is treating “show all trajectories” as a rendering instruction instead of an information promise. That would produce thousands of duplicated lines, reward false paths assembled from stage order, and make the highest total-step routes visually unreadable precisely because they are the most important. The guardrail is a single evidence-backed trajectory graph per route: all logical paths remain enumerable, shared work is rendered once, every collapsed group reports what it hides, and every complexity number is derived from those same retained paths.
