# First Vertical Slice: Route Data Trajectory

## Outcome

Implement one complete new visualization that lets a developer select an application route and understand how persisted data becomes a rendered value.

The primary proof is `visual-notes`:

```text
/time-blocks
  -> Prisma timeBlock rows
  -> mapTimeBlock / TimeBlockItem
  -> Solid query + resource
  -> optimistic read projection
  -> day and overlap augmentation
  -> date/viewport geometry
  -> resting time-block style
```

The secondary proof is Pluck's `/captures/[captureId]` path from saved JSON through `CaptureDetail` and the viewer model to one stage or inspector render terminal.

The product test is understanding, not automated diagnosis. Within five minutes, a developer unfamiliar with the path should be able to explain:

- which persisted/domain value intersects the selected route;
- the ordered semantic operations applied to it;
- where its type or fields change;
- which components/boundaries carry it;
- which values contribute to the selected render sink;
- where the trace is incomplete;
- which operation or boundary deserves closer code inspection.

## Scope

### Included

- SolidStart filesystem route discovery sufficient for the two fixtures;
- route parameter, route component, shell, and participating component facts;
- Prisma reads and file/JSON/Zod reads as persistence sources;
- Solid `query` and `createResource` read boundaries;
- cross-file first-party calls, props, context reads, accessors, and collection callback bindings needed to maintain value identity;
- shallow before/after type shapes and field-change summaries for participating operations;
- a route-context view and a focused left-to-right data trajectory;
- selection, fading, explicit isolation, and in-place expansion;
- hover/focus preview, persistent inspector, and modal/drawer source evidence;
- URL restoration of all meaningful exploration state;
- explicit trace completeness and opacity;
- adding selected evidence to a local work-packet collection.

### Excluded

- event-to-action/write tracing;
- mutation, refresh, rollback, or full optimistic reconciliation loops;
- a general state machine or sequence diagram;
- automatic smell/fix recommendations based on the new shapes;
- all-framework route discovery;
- automatic feature/community clustering;
- a universal whole-repository graph;
- comparison across revisions;
- replacing or deleting the current world map or reports;
- user-authored graph layout.

Interaction state may appear as an input to a selected rendered value. For example, `optimisticTimes` is included because it changes the read value that reaches geometry, and `draggingBlockId` may be shown as an opacity contributor. The slice does not attempt to explain how those states are mutated.

## Entry and user flow

### Launch

Add a **Data trajectories** button beside the existing Component Structure experiment in the world-map lens controls. It opens a full-screen modal/dialog implemented as a standalone focused component. Do not reshape the existing world map in this slice.

Opening behavior:

1. Restore a valid route/trajectory selection from the URL.
2. Otherwise select the first route with a complete persistence-to-render trajectory.
3. Otherwise show the route inventory and explain why no complete trajectory is available.

### Route context mode

The initial modal contains:

- a compact route selector/search in the fixed header;
- the selected route and route parameter facts;
- a bounded route-context graph;
- persistence/domain values entering from the left;
- the route shell/component region in the center;
- grouped render terminal families on the right;
- a persistent inspector on the right side of the workspace.

The route shell/component region is a meaningful nested group. Do not display every file or AST operation in context mode. Component-render and containment relationships are supporting structure; data connections remain visually primary.

Selecting a type, value, component, or terminal fades unrelated context without changing layout. The user may then choose **Open trajectory** or double-click a participating value/terminal.

### Trajectory mode

Render an ordered left-to-right path. Use semantic stage bands only as orientation labels—not as a sequence diagram:

```text
PERSISTED SOURCE | LOAD / BOUNDARY | SHAPE / DERIVE | ROUTE / COMPONENT | RENDER
```

The path should normally contain 6–15 collapsed semantic-operation nodes. Shared input operations appear once. Multiple relevant sinks may fan out at the right edge, but selecting one sink focuses its contributor slice.

Selection behavior:

- click: select and populate the inspector;
- hover/focus: quick preview without changing selection;
- unrelated context fades but remains visible;
- **Isolate** explicitly removes unrelated context and retains summarized incoming/outgoing boundary nodes;
- click empty canvas: clear the item selection but retain route and trajectory;
- Escape: close transient source/preview surfaces before closing the main modal.

Expansion behavior:

- expanding an operation replaces it in place with ordered child operations or source expressions;
- collapsed external connections remain attached to the expanded boundary;
- collapsing restores the original node and layout;
- the expansion set is URL-backed;
- expansion never changes the semantic meaning or ordering of neighboring nodes.

## Visual node contract

### Default node: semantic operation

A semantic operation answers “what happened to the value?” Examples:

- `Read time blocks from Prisma`
- `Map row to TimeBlockItem`
- `Load weekly blocks resource`
- `Overlay optimistic start/end`
- `Group blocks by day`
- `Assign overlap slot`
- `Convert dates to block geometry`
- `Render resting block style`

Each compact node shows, when available:

- operation label;
- primary input → output type name;
- effect badge: preserve, project, augment, derive, select, group, normalize, opaque, or render;
- field summary such as `12 → 12`, `+2 fields`, `start/end replaced`, or `shape unknown`;
- trace-completeness state.

Avoid generic syntax labels such as `call`, `object-pack`, or `property-read` at the default level when a higher-confidence semantic description exists.

### Expanded child: source expression

A source-expression node is exact evidence rather than a second abstraction level. It shows:

- expression text or a concise code label;
- operation kind;
- input/output checker type;
- file and line;
- compiler identity/confidence;
- unknown boundary if applicable.

Several source expressions may implement one semantic operation. Conversely, one expression may produce multiple field-level effects. Preserve this many-to-many relation in the analysis model; the UI projection chooses an ordered explanation.

### Edges

Data edges are the only always-visible edge family. They state that an output value/field contributes to the next operation.

Supporting relationships use restrained, opt-in overlays or node annotations:

- component/prop/context boundary crossed;
- first-party call crossed;
- condition controls the selected value;
- containment/render hierarchy.

Do not draw a general call graph or component graph behind the trajectory.

## Progressive disclosure and inspector

### Hover/focus preview

Show a small non-persistent card containing:

- full operation/value label;
- type and field-change summary;
- source file/line;
- one-line completeness or opacity explanation.

### Persistent inspector

Selection always populates a fixed inspector with sections ordered by use:

1. operation/value summary;
2. input and output identities/types;
3. field preservation/change table;
4. exact source expressions and locations;
5. upstream/downstream neighbors;
6. component/boundary crossings;
7. confidence, unknowns, and disproof notes;
8. actions: open source, isolate, add to packet.

Use compact tables for fields and evidence. Large shapes show changed/participating fields first, with truthful totals and an explicit expansion control.

### Source viewer

Open source in a modal or drawer above the trajectory so graph state remains mounted. Requirements:

- focus the exact expression span and show nearby context;
- previous/next evidence navigation within the selected operation;
- link to the existing full file page as a secondary action;
- close back to the same selected node and viewport;
- do not encode source text in the URL.

## URL state

All meaningful exploration state must round-trip through query parameters:

```text
viz=trajectory
route=<stable-route-key>
flow=<stable-trajectory-key>
item=<stable-entity-or-operation-key>
expand=<comma-separated-stable-operation-keys>
isolate=0|1
filter=<optional-value-or-type-filter>
view=<context|trajectory>
pan=<optional-x,y>
zoom=<optional-scale>
packet=<optional-local-packet-id>
```

Rules:

- use semantic source-based keys, not array indexes;
- update ordinary selection with `history.replaceState` so inspection does not flood browser history;
- route/flow changes may push history so Back returns to the previous investigation;
- parse URL state before first interactive render to avoid a default-view flash;
- if a key is invalid after source changes, retain the nearest valid route, clear only invalid descendants, and show a quiet restoration notice;
- unchanged analysis plus refresh must restore the same view, selection, expansion, isolation, and source focus without a visible reset.

## Minimum analysis model

Do not implement all primitives from `03-core-semantic-primitives.md` first. Add a narrow model that can grow into them:

```ts
type RouteRecord = {
  key: string;
  pathPattern: string;
  file: string;
  componentIdentityId: string | null;
  parameters: Array<{ name: string; kind: string }>;
  confidence: EvidenceConfidence;
};

type ValueShapeSummary = {
  id: string;
  typeName: string | null;
  typeText: string;
  kind: "primitive" | "object" | "collection" | "union" | "opaque";
  fields: Array<{ key: string; typeText: string; optional: boolean }>;
  totalFields: number;
  opacityReason: string | null;
};

type DataOperation = {
  key: string;
  semanticKind: "read" | "parse" | "validate" | "map" | "project" |
    "augment" | "derive" | "select" | "group" | "normalize" |
    "boundary" | "render" | "opaque";
  label: string;
  inputValueIds: string[];
  outputValueIds: string[];
  inputShapeIds: string[];
  outputShapeIds: string[];
  fieldEffects: FieldEffect[];
  sourceExpressionIds: string[];
  boundary: DataBoundary | null;
  confidence: EvidenceConfidence;
};

type RouteDataTrajectory = {
  key: string;
  routeKey: string;
  sourceValueIds: string[];
  operationKeys: string[];
  terminalIds: string[];
  supportingComponentIds: string[];
  completeness: "complete-for-supported-scope" | "partial" | "unknown";
  omissions: string[];
};
```

Reuse `ExpressionIdentityEvidence`, `TraceStep`, `GraphNode`, and existing sink/terminal facts where they remain truthful. The new records are semantic projections over compiler/source evidence, not replacements for that evidence.

## Static-analysis work

### 1. Route discovery

Add a SolidStart filesystem-route adapter under `src/project` or a focused `src/analysis/routes` module. It must:

- derive route patterns and parameters from source file paths;
- identify default route components and immediate shell component renders;
- attach source evidence and confidence;
- remain separate from frontend URLs for the analyzer application.

Only support conventions exercised by `visual-notes` and Pluck in this slice. Unsupported patterns contribute a coverage omission.

### 2. Persistence-source adapters

Add semantic classification over participating calls:

- Prisma model reads such as `findMany`/`findUnique` become typed read operations;
- `readFile` → `JSON.parse` → Zod `parse` becomes read/parse/validate operations;
- wrappers such as Pluck's `readJsonFile` remain expandable first-party operations;
- do not globally scan and display every database/filesystem call—retain only calls that participate in selected route-to-render reachability.

The database model or validated schema result should be the source identity when compiler/schema evidence supports it. Otherwise label the source as typed/opaque with the exact reason.

### 3. Read-boundary continuation

Teach tracing to maintain value identity across the supported patterns:

- SolidStart `query` wrapper function to its return value;
- `createResource(source, fetcher)` from fetcher result to resource accessor/`.latest`;
- resource fallback/selection such as Pluck's page → summary → full detail choice;
- component props and context providers/consumers;
- array `.map`, grouping loops, flattening, spreads, and collection callback elements;
- first-party helper calls within the existing depth/budget controls.

Do not invent runtime execution order. The result is a static possible data trajectory with ordered derivation evidence.

### 4. Shallow shapes and field effects

For values participating in candidate trajectories:

- normalize shallow checker types;
- retain named symbol identity where available;
- cap serialized field lists while preserving total counts;
- record high-confidence effects for property access, object literal/spread, typed return construction, collection element mapping, and conditional selection;
- classify ambiguous/custom calls as opaque;
- distinguish preserve/project/augment/derive/normalize from generic representation churn.

Required time-block facts:

- Prisma row → `TimeBlockItem` field mapping;
- resource collection retains `TimeBlockItem[]`;
- optimistic merge preserves block identity and replaces only start/end fields;
- `TimeBlockWithPosition` augments the block with overlap fields;
- geometry derives scalar/string fields from time, viewport, overlap, and interaction inputs.

### 5. Trajectory assembly

Create a selector that joins:

- route/component participation;
- persistence roots;
- forward identity/operation reach;
- existing backward sink traces;
- component/prop/context crossings;
- terminal sinks.

Join by compiler/value identity and explicit operation edges, never by display name. Prefer a complete source-to-terminal path. When the forward and backward halves cannot meet, return a partial trajectory with the unmatched boundary named.

Semantic-operation grouping is a pure analysis/report selector. It should collapse related source expressions when they share one meaningful input/output transition, such as the individual Prisma-row property reads constructing `TimeBlockItem`.

### 6. Stable keys

Generate deterministic keys from stable source facts:

- route pattern + route file;
- operation kind + defining expression span + participating symbol IDs;
- trajectory route key + source definition + terminal definition.

The promise is refresh stability for unchanged source, not permanent identity across arbitrary refactors.

## API and server work

Add strict DTOs for:

- route inventory summaries;
- route-context nodes/groups/edges;
- trajectory summaries;
- complete selected trajectory operations, values, shapes, evidence, and terminal facts;
- source excerpt requests by validated contained file path and span;
- local work-packet collection records if not already representable by existing cleanup/work-packet DTOs.

Prefer a summary/detail boundary:

- workspace response includes the bounded route inventory and trajectory summaries needed to open the modal;
- selecting a trajectory fetches its full detail;
- source excerpts load on demand;
- the server caches projections by analysis generation and returns the generation ID so stale URL selections can be reconciled.

Do not place SVG coordinates, DOM classes, colors, or query-string URLs in DTOs.

## Frontend work

Keep responsibilities focused:

```text
DataTrajectoryDialog.tsx          modal shell, focus/escape/body lock
RouteTrajectoryWorkspace.tsx      route/context/trajectory composition
RouteContextMap.tsx               bounded route-centered overview
DataTrajectoryCanvas.tsx          ordered path rendering and pan/zoom
TrajectoryOperationNode.tsx       compact/expanded operation rendering
TrajectoryInspector.tsx           selected evidence and actions
TrajectorySourceDialog.tsx        source excerpt viewer
trajectory-layout.ts              pure layout and expansion model
trajectory-url-state.ts           parse/serialize/reconcile URL state
trajectory-selection-model.ts     pure focus/isolation selectors
```

Use the current Component Structure dialog as interaction precedent, but do not couple the new visualization to `ComponentStructureMap`'s node/edge schema or depth layout. Reuse small generic dialog/pan/zoom helpers only if extraction makes both callers simpler.

Layout requirements:

- deterministic server/first-client DOM structure;
- pure data shaping outside JSX;
- no viewport-dependent render branching before mount;
- persistent inspector remains visible without scrolling away from the canvas;
- support keyboard selection, expansion, isolation, and source opening;
- labels truncate safely but remain available on focus/hover;
- SVG/HTML choice is an implementation detail; nodes must support accessible DOM controls and large scrollable trajectories.

## Work-packet collection

The first slice only needs a lightweight local collection:

- **Add to packet** stores a reference to the selected route, trajectory, operation/entity, source evidence, and a short user annotation;
- show a packet count and allow removing/reordering entries;
- persist the active packet identifier in the URL and packet contents in local analyzer workspace storage or a small server-side local file keyed by project root;
- export the packet as Markdown with stable source locations and trace completeness;
- do not automatically call every collected item a finding.

If packet persistence would materially delay the core visualization, ship in-memory collection plus Markdown copy after the primary acceptance test passes, then add durable local persistence before declaring the slice complete.

## Verification

### Focused analyzer tests

- SolidStart route pattern and parameter extraction;
- Prisma read classification without false matching arbitrary `findMany` methods;
- read/parse/Zod validation classification;
- `query` and resource result continuation;
- prop/context and collection-element identity preservation;
- object spread augmentation and selected field replacement;
- opaque-call negative cases;
- deterministic operation/trajectory keys;
- partial trajectory and omission reasons.

### Projection/contract tests

- strict DTO parsing;
- caps preserve truthful totals;
- route summaries do not include unrelated repository reads;
- detail projection contains ordered operations and evidence;
- invalid generation/selection produces recoverable state.

### Frontend tests

- URL parse/serialize round trip for every state field;
- initial URL state renders without default-selection flash;
- selection fades but does not remove context;
- isolation retains boundary stubs;
- expansion replaces one operation with children and collapses losslessly;
- keyboard/focus behavior;
- inspector and source dialog preserve canvas state;
- invalid URL descendants clear without discarding the valid route.

### Repository gates

After structural implementation changes run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add analysis/interaction timing measurements for repositories in the target range of several hundred files and roughly 10,000–50,000 lines. Once analysis data is loaded, route switching, trajectory selection, focus, and expansion should feel immediate and should not trigger a full reanalysis.

## Acceptance walkthrough: `visual-notes`

1. Analyze `/Users/byronwall/Projects/visual-notes/app` with its real tsconfig.
2. Open **Data trajectories**.
3. Select `/time-blocks` from the route selector or restore it from the URL.
4. See `TimeBlockItem`/weekly blocks among the persisted values intersecting the route.
5. Open the trajectory ending at the resting time-block style.
6. Read a 6–15 node left-to-right explanation covering Prisma, mapping, resource, optimistic overlay, grouping/overlap, geometry, and render.
7. Select geometry and see contributors for time, viewport, overlap, and dragging opacity in the inspector.
8. Expand mapping or geometry and inspect exact source expressions.
9. Open a source expression in the modal, close it, and return to the unchanged diagram.
10. Refresh the page and recover route, trajectory, selection, expansion, isolation, and viewport from the URL without a default-state flash.
11. Add the geometry operation or another suspicious boundary to a work packet with a note.

The walkthrough fails if the path stops at literals, duplicates the same block lineage into unrelated paths, hides opacity, calls legitimate geometry a smell, or requires reading source to understand the basic ordered flow.

## Acceptance walkthrough: Pluck

1. Analyze `/Users/byronwall/Projects/pluck-ui/app` with its real tsconfig.
2. Select `/captures/[captureId]`.
3. Select `CaptureDetail` or a participating nodes/sections/fragments value.
4. Open a trajectory from saved JSON through parse/validation, detail assembly, resources, route shell, viewer context, and one stage/inspector render terminal.
5. Expand the persisted-read operation to see individual manifest/section/node/fragment reads.
6. Confirm large shapes are summarized, changed/participating fields are prioritized, and totals remain truthful.
7. Confirm page/summary/full detail selection is represented as one conditional value selection rather than unrelated roots.
8. Confirm the same UI, layout primitives, DTOs, and analysis records were used without Pluck-specific frontend branches.

Pluck may expose additional partial paths. The gate is one coherent complete-for-supported-scope route-to-render trajectory plus honest omissions.

## Completion criteria

The slice is complete only when:

- the full `visual-notes` walkthrough passes;
- the Pluck robustness walkthrough passes;
- a developer can explain the selected time-block data path within five minutes using the visualization alone, then verify any claim in source;
- refresh restores the investigation bumplessly against unchanged analysis;
- no fixture-specific frontend logic exists;
- incomplete analysis is visible at the exact boundary;
- the new visualization is available as a standalone experiment without regressing the current world map, component structure map, file explorer, or reports;
- repository verification passes.

## Horizontal expansion after the decision point

After using the completed slice, make an explicit keep/change/stop decision before broadening it.

If it proves useful, expand in this order:

1. more persistence and framework adapters;
2. route-to-render coverage and type/field provenance depth;
3. render variants and conditional contributors;
4. event/write/reconciliation paths;
5. related-trajectory navigation and durable work packets;
6. broader route/application atlas using the same selected-trajectory component;
7. evidence-backed cleanup detection and before/after comparison.

Do not begin the broader atlas or mutation explorer merely because their primitives are available. Require evidence that the first route-to-render trajectory changes how developers understand or choose work.
