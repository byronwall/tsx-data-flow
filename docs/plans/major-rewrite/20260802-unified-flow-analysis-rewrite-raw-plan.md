# Unified Flow Analysis Rewrite — Raw Plan

**Status:** Initial product and architecture plan  
**Date:** 2026-08-02  
**Purpose:** Capture the full rewrite scope before splitting it into executable plans.

This document is intentionally broad. It records the product direction, semantic
model, user experience, migration strategy, risks, fixtures, and deferred ideas.
It is not yet an implementation plan.

## 1. Purpose and sources

The rewrite should make `tsx-data-flow` a tool for understanding how data moves
through an application. The first and most important product is a route-level
trajectory. The underlying model must also support CLIs, back-end services,
serverless handlers, components, functions, and later type-flow analysis.

This plan combines:

- the product discussion from 2026-08-02;
- the observed `readFile` route-source regression;
- [data trajectory product intent](../../data-trajectory-intent.md);
- [application structure](../../application-structure.md);
- [existing product pillars](../../product-pillars/README.md);
- [existing semantic primitives](../../product-pillars/03-core-semantic-primitives.md);
- [the existing first route slice](../../product-pillars/07-first-vertical-slice-route-data-trajectory.md);
- [code visualization and data-flow mapping transcript](../../transcripts/20260705-210437-code-visualization-and-data-flow-mapping.txt);
- [type-flow tracing transcript](../../transcripts/20260708-210533-static-analysis-type-flow-tracing.txt);
- [repository-wide visualization transcript](../../transcripts/20260712-211144-repo-wide-visualization-and-data-flow.txt);
- [route diagram feedback transcript](../../transcripts/20260714-075703-tsx-diagramming-tool-feedback.txt);
- [context-driven data-flow transcript](../../transcripts/20260724-211009-context-driven-data-flow-views.txt);
- [context-driven transcript decomposition](../../feedback/20260724-context-driven-data-flow-transcript-decomposition.md).

Other transcripts in `docs/transcripts/` provided project examples and broader
tooling context. They did not add separate near-term requirements to this plan.

## 2. Executive synthesis

The route trajectory graph is the main product.

Its first view should give a holistic route overview. The user should see every
proven source, participating component occurrence, connection, boundary, and
terminal. The total count and the shape of the graph are useful evidence.

The overview should help a user notice:

- whether a route uses 30, 50, or 80 component occurrences;
- whether the route contains separate islands;
- whether one top-level source hydrates most of the route;
- whether sources enter through many independent regions;
- whether the component surface is deeply chained or broadly connected;
- where client, server, resource, context, and external boundaries occur;
- where static proof stops.

The overview is component-first. It is not a component structure product.
Components are the main visible grain because they orient the user within a
route. Data movement remains the subject.

Transforms, types, code, and findings should not crowd the first view. They
should appear through selection, isolation, an inspector, and focused detail
views.

The analyzer should produce one evidence model. Routes, commands, handlers, and
components should create slices from that model. They must not build separate
trajectory systems.

The rewrite may replace current DTOs, URLs, and UI concepts. No external
compatibility promise currently limits the design.

## 3. Product thesis

The durable product question is:

> What enters this code scope, how does it move and change, where is it used,
> and where does static proof stop?

The route version is:

> Which sources participate in this route, which component occurrences carry
> their data, and where does that data reach rendering or another system edge?

The product needs two connected levels:

1. **Holistic overview:** Show the total route surface and its connectivity.
2. **Focused explanation:** Let the user inspect one source, occurrence, edge,
   field, transform, terminal, finding, or code region.

The overview is an index into focused explanations. Both levels must use the
same evidence.

## 4. Product decisions

### 4.1 Decided direction

- Build one scope-neutral program evidence model.
- Make route analysis the first and strongest product projection.
- Render component occurrences, not merged component definitions.
- Show all proven route branches by default.
- Keep isolation as an explicit user action.
- Show source, component, boundary, and terminal marks at low zoom.
- Reveal labels as zoom permits.
- Hide generic UI wrappers without losing their local child relationships.
- Keep hidden path evidence available for expansion.
- Treat source and terminal as roles within a selected slice.
- Cross client and server boundaries when one repository provides exact proof.
- Show unproven gaps instead of speculative connections.
- Keep transforms out of the default route overview.
- Keep code in an inspector or a separate code-focused surface.
- Keep findings as an optional layer.
- Preserve the main view across refresh.
- Treat current URLs, DTOs, scripts, and reports as replaceable.
- Target projects between 10,000 and 100,000 lines for the first performance bar.
- Use small example projects to force support for several application forms.

### 4.2 Near-term candidates

- A Solid route adapter.
- An HTTP endpoint adapter.
- A Node CLI adapter.
- A serverless handler adapter.
- A component-first route projection.
- A source-isolation overlay.
- A compact evidence and code inspector.
- Exact client-to-server bridge matching.
- Local refresh restoration.
- Pluck as the main robustness case.

### 4.3 Exploratory branches

- A type-first graph projection.
- Field-level subway or bundle visuals.
- Full read, modify, write, and reconcile cycles.
- Finding impact paths drawn over the graph.
- Runtime evidence joined with static evidence.
- Repository-level application architecture views.
- User-selected grouping by feature, package, domain, or runtime.
- Work packets for coding agents.

### 4.4 Parked or cautioned ideas

- Do not preserve the separate component structure product.
- Do not preserve evidence cards as a UI form.
- Do not show all transforms in the initial route view.
- Do not infer a path from matching names or fields.
- Do not merge component occurrences by definition in the route hierarchy.
- Do not make files the primary analysis boundary.
- Do not build the complete type-transform product during the first rewrite slice.
- Do not build public sharing or durable link compatibility now.

## 5. Primary jobs and desired outcomes

### J01 — Understand a route as a whole

**Actor:** Developer entering an unfamiliar route

**When** a route contains many sources and component paths,  
**I want to** see its total proven rendering surface and connectivity,  
**so I can** form a useful mental model before reading individual files.

**Success looks like**

- source, occurrence, boundary, and terminal counts are visible;
- the graph reveals islands, hubs, deep chains, and broad branches;
- the user can explain the route's major shape within five minutes;
- hidden UI wrappers do not create false relationships;
- missing proof is visible.

**Evidence**

- 2026-08-02 product discussion, answers to product questions 1–4;
- route diagram feedback transcript, discussion of route totality;
- repository-wide visualization transcript, application orientation sections.

**Commitment:** Decided direction

### J02 — Find every real origin involved in a route

**Actor:** Developer investigating route data

**When** a route obtains data from several systems,  
**I want to** see each proven origin and its participating paths,  
**so I can** understand what hydrates the route and avoid unrelated reads.

**Success looks like**

- `readFile` appears only when a concrete call occurrence belongs to the slice;
- database, filesystem, network, URL, and global-state origins are classified;
- selecting an origin highlights only proven occurrence paths;
- broad fallback matching never lights unrelated consumers.

**Evidence**

- 2026-08-02 source definition discussion;
- `readFile` regression investigation;
- data trajectory product intent, source and resource identity sections.

**Commitment:** Decided direction

### J03 — Follow data to every scope terminal

**Actor:** Developer tracing a value

**When** data crosses helpers, resources, components, contexts, and runtimes,  
**I want to** follow every proven branch to the current scope edge,  
**so I can** understand the complete impact of that data.

**Success looks like**

- front-end paths reach render terminals;
- API paths reach responses or side effects;
- CLI paths reach output or side effects;
- hidden nodes do not truncate a path;
- user isolation changes visibility but not evidence.

**Evidence**

- 2026-08-02 answers to product questions 3, 6, and 7;
- code visualization transcript, input-to-output trajectory discussion.

**Commitment:** Decided direction

### J04 — Inspect one component occurrence without losing context

**Actor:** Developer moving from overview to detail

**When** one route component or connection becomes interesting,  
**I want to** inspect its code, evidence, inputs, outputs, and findings,  
**so I can** answer a focused question without rebuilding route context.

**Success looks like**

- one click selects an occurrence or edge;
- the inspector shows exact code locations and proof;
- code opens without destroying graph state;
- the user can isolate the selected path;
- the user can return to the same viewport and selection.

**Evidence**

- 2026-08-02 answers to product questions 11, 12, and 14;
- existing code-view product value described in the rewrite discussion.

**Commitment:** Decided direction

### J05 — Distinguish reuse from false hierarchy joins

**Actor:** Developer reading the route graph

**When** several parents use one shared component definition,  
**I want to** see separate call-site occurrences,  
**so I can** avoid mistaking shared implementation for shared route ownership.

**Success looks like**

- `HStack`, `VStack`, `Grid`, and similar definitions do not join callers;
- each call site retains its local children;
- selecting a definition can still highlight all occurrences;
- repeated large components expose reuse without merging their hierarchies.

**Evidence**

- 2026-08-02 discussion of shared component definitions and hidden UI children.

**Commitment:** Decided direction

### J06 — Understand a non-route program scope

**Actor:** Developer analyzing a CLI, API, handler, or standalone component

**When** the program has no web route,  
**I want to** select another concrete entry scope,  
**so I can** use the same flow model for that program.

**Success looks like**

- a CLI command traces input through work to output and side effects;
- an API handler traces request input to response and writes;
- a serverless handler behaves like an endpoint scope;
- a component can use public inputs as local entry points;
- no adapter creates a private graph model.

**Evidence**

- 2026-08-02 discussion of route-independent analysis;
- repository-wide visualization transcript, CLI and server entry examples.

**Commitment:** Near-term candidate with a decided architectural constraint

### J07 — Understand type and field transformation

**Actor:** Developer investigating data-shape churn

**When** a value is picked, packed, renamed, narrowed, or rebuilt,  
**I want to** see field and type lineage,  
**so I can** decide whether the transformation is necessary and linked.

**Success looks like**

- field selections and object construction retain upstream identity;
- canonical types differ from disconnected mirror types;
- narrowing to a scalar and restoring an object is visible;
- legitimate domain work is not marked as a defect merely because it is long.

**Evidence**

- type-flow tracing transcript;
- code visualization transcript, intermediate transformation sections;
- existing product pillars, canonical data and field provenance jobs.

**Commitment:** Exploratory branch; retain supporting evidence when practical

### J08 — Reveal findings through the graph

**Actor:** Developer reviewing a known or detected concern

**When** a finding affects a path,  
**I want to** reveal its impact over the route graph,  
**so I can** understand its cause and blast radius.

**Success looks like**

- findings remain quiet until requested;
- a marker can show that findings exist;
- selecting a finding reveals affected occurrences and paths;
- finding details remain in the inspector;
- evidence determines impact instead of field-name overlap.

**Evidence**

- 2026-08-02 answer to product question 12;
- existing code-view and finding product discussion.

**Commitment:** Exploratory branch

## 6. Core semantic model

## 6.1 Program evidence is the shared truth

The analyzer should record stable program facts before it creates a route or
other user-facing slice.

The stable model should contain:

- declarations and expressions;
- source locations;
- compiler symbol identity;
- type identity;
- component definitions;
- component call sites;
- values;
- operations;
- function calls and returns;
- property and field reads;
- render relationships;
- data relationships;
- boundaries;
- external effects;
- proof and confidence;
- explicit analysis gaps.

The stable model should not require:

- a route ID on every record;
- a component ID on every operation;
- a fixed source role;
- a fixed sink role;
- one visualization grain;
- one framework.

Conceptual records:

```ts
type ProgramElement = {
  id: string;
  kind: ProgramElementKind;
  location: SourceSpan;
  symbolId: string | null;
  typeId: string | null;
};

type ProgramRelation = {
  id: string;
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: SourceSpan[];
  proof: ProofKind;
  confidence: "proven" | "partial";
};
```

These are conceptual interfaces. Their final form should follow the existing
analyzer model where possible.

## 6.2 Origins and terminals are slice roles

A stable program element should describe what the code does. A selected slice
should describe the role it plays in that investigation.

One `fetch` call may be:

- an origin in a front-end-only scope;
- a boundary in a full-stack scope;
- an outgoing terminal in a back-end scope.

One HTTP response may be:

- a terminal when the client is outside the repository;
- a boundary when a matching client call is proven;
- an origin for the client portion of a full-stack slice.

This separation prevents the core model from becoming route-specific.

## 6.3 Origin taxonomy

An origin is the proven end of a backward trace for the selected scope.

```ts
type OriginKind =
  | "database"
  | "filesystem"
  | "network"
  | "environment"
  | "url"
  | "global-state"
  | "browser-storage"
  | "process-input"
  | "message"
  | "opaque";
```

The system should distinguish a source definition from a source occurrence.

```text
Definition: readFile
Occurrence: readFile(manifestPath, "utf8") at migrations.ts:18
```

Route membership must attach to the occurrence.

## 6.4 Terminal taxonomy

A terminal is where the selected scope reaches an owned output or loses local
ownership.

```ts
type TerminalKind =
  | "jsx-text"
  | "dom-attribute"
  | "style"
  | "component-input"
  | "http-response"
  | "network-request"
  | "database-write"
  | "filesystem-write"
  | "browser-storage-write"
  | "stdout"
  | "stderr"
  | "exit-status"
  | "message-publish"
  | "external-effect";
```

The term `terminal` is preferred over `meaningful consumer`. Any operation can
consume data. A terminal describes the edge of the current slice.

## 6.5 Operation taxonomy

Operations should remain first-class evidence even when the overview hides
them.

Important operations include:

- alias;
- field read;
- nested field read;
- indexing;
- destructuring;
- pick and omit;
- object pack;
- field rename;
- object spread;
- map;
- filter;
- reduce and aggregate;
- parse and validate;
- serialize;
- default and fallback;
- conditional selection;
- type narrowing;
- function argument and return;
- resource load and result;
- property handoff;
- context provision and consumption;
- state read and write;
- render;
- external effect.

The graph must not claim a type or field effect without evidence.

## 6.6 Relationship families

The product should preserve three relationship families.

### Render relationships

These show that one occurrence renders another occurrence.

They provide the structural frame of the route overview.

### Data relationships

These show that a value contributes to another value, operation, occurrence, or
terminal.

They become prominent during source or terminal selection.

### Boundary relationships

These show that data crosses a framework, resource, process, network, storage,
or runtime boundary.

The UI may draw these families together. The model must never merge their
meaning.

## 6.7 Evidence gaps

An unproven connection should be a gap, not a low-confidence edge.

```ts
type EvidenceGap = {
  from: string;
  expectedDirection: "upstream" | "downstream";
  reason:
    | "unsupported-syntax"
    | "dynamic-dispatch"
    | "external-code"
    | "budget-exhausted"
    | "identity-lost"
    | "unresolved-symbol";
  location: SourceSpan | null;
};
```

The UI may show an open edge stub. It should explain the reason on selection.

## 7. Scope model

## 7.1 Scope adapters

A scope adapter discovers useful entry points. It does not construct its own
trajectory graph.

```ts
interface ScopeAdapter {
  discover(evidence: ProgramEvidence): ScopeCandidate[];
  seed(candidate: ScopeCandidate): ScopeSeed;
}
```

Initial adapter families:

- web route;
- HTTP endpoint;
- CLI command;
- serverless handler;
- standalone component;
- selected function.

Adapters may provide useful defaults:

- entry elements;
- boundary policy;
- terminal policy;
- labels;
- framework evidence;
- default projection grain.

They must not create new node identities or private lineage rules.

## 7.2 Slice query

The slice query converts a scope seed into a bounded evidence graph.

```ts
type SliceQuery = {
  scope: ScopeSeed;
  direction: "forward" | "backward" | "both";
  boundaryPolicy: BoundaryPolicy;
  terminalPolicy: TerminalPolicy;
};

type EvidenceSlice = {
  elements: ProgramElement[];
  relations: ProgramRelation[];
  origins: SliceOrigin[];
  terminals: SliceTerminal[];
  gaps: EvidenceGap[];
  coverage: CoverageSummary;
};
```

The route trajectory is one evidence slice. A CLI command uses the same slice
query with another seed.

## 7.3 Route scope defaults

A route slice should:

- begin at the route entry and its layout or shell chain;
- include every proven participating component occurrence;
- search backward for true origins;
- search forward to render and external terminals;
- cross resources, properties, contexts, and first-party calls;
- cross client and server code when an exact bridge exists;
- retain all proven branches;
- report unsupported or incomplete paths;
- collapse generic UI only during projection.

## 7.4 CLI scope defaults

A CLI slice should:

- begin at command registration or the selected command handler;
- include command arguments, environment, standard input, and file reads;
- follow function calls and value transformations;
- end at output, exit status, writes, requests, messages, and child processes;
- mark repeated or conditional command branches;
- avoid route or component assumptions.

## 7.5 Back-end scope defaults

An API or serverless slice should:

- begin at the request or event handler;
- treat request parameters and payload as input boundaries;
- include persistence, external service, validation, and serialization work;
- end at responses, writes, messages, and external effects;
- cross into an in-repository client only with exact bridge evidence.

## 7.6 Standalone component defaults

A standalone component slice should:

- treat public properties, context, and local resources as input boundaries;
- follow data into render terminals and callbacks;
- show external callback use as a terminal when callers are not included;
- optionally expand outward to known callers;
- retain call-site occurrence identity.

## 8. Component definition and occurrence model

## 8.1 Why the distinction matters

One component definition can appear at many call sites. Merging those call sites
creates false route relationships.

For example:

```tsx
function PanelA() {
  return <HStack><CustomerName /></HStack>;
}

function PanelB() {
  return <HStack><OrderTotal /></HStack>;
}
```

A definition-based graph can incorrectly show:

```text
PanelA ─┐
        ├─ HStack ─┬─ CustomerName
PanelB ─┘          └─ OrderTotal
```

The occurrence graph should show:

```text
PanelA → HStack occurrence A → CustomerName
PanelB → HStack occurrence B → OrderTotal
```

## 8.2 Required identities

### Component definition

The declared function or component symbol.

### Render occurrence

One static call site within one parent occurrence and slice path.

### Runtime instance

One runtime render produced by a static occurrence. Static analysis usually
cannot count runtime instances.

Conceptual records:

```ts
type ComponentDefinition = {
  id: string;
  name: string;
  location: SourceSpan;
};

type RenderOccurrence = {
  id: string;
  definitionId: string;
  callSite: SourceSpan;
  parentOccurrenceId: string | null;
  scopeId: string;
  repetition: "single" | "collection" | "conditional" | "unknown";
};
```

The default graph renders occurrences. The inspector links occurrences to the
shared definition.

## 8.3 Default reuse behavior

Do not merge occurrences by default.

Show shared definition identity through:

- a reuse count;
- a small badge or ring;
- common definition highlighting;
- an inspector list of call sites;
- a `show all occurrences` action.

This keeps hierarchy honest while preserving useful reuse evidence.

## 8.4 Large reused components

A large reused component may create repeated subtrees. The default should still
show separate top-level occurrences.

Each repeated subtree may remain collapsed:

```text
LargeInspector
25 descendants · 18 terminals · 3 route occurrences
```

Possible actions:

- expand this occurrence;
- expand all occurrences;
- compare occurrences;
- inspect the shared definition;
- explicitly consolidate equivalent subtrees.

Consolidation is a view action. It is not the default evidence model.

## 8.5 Collections and runtime multiplicity

One static call site inside a collection should appear once with a repetition
marker.

```text
InventoryRow × collection
```

The graph should not claim a runtime count unless runtime evidence supplies it.

## 8.6 Caller-owned and definition-owned children

A wrapper can receive caller-owned children and create definition-owned
children.

The model must preserve that ownership.

```tsx
function Card(props) {
  return (
    <Box>
      <CardHeader />
      {props.children}
    </Box>
  );
}
```

`CardHeader` belongs to the `Card` definition. `props.children` came from the
caller. Both relationships need explicit slot evidence.

## 9. Generic UI projection

## 9.1 Product goal

Generic UI components should not dominate the route graph.

Examples include:

- `HStack`;
- `VStack`;
- `Grid`;
- `Box`;
- simple text wrappers;
- design-system layout primitives.

Hiding a wrapper must not merge unrelated caller branches.

## 9.2 Occurrence-preserving splice

Before hiding:

```text
Parent
  → HStack occurrence
    → ChildA
    → ChildB
```

After hiding:

```text
Parent
  → ChildA
  → ChildB
```

Each replacement edge retains:

- the hidden occurrence ID;
- its call-site location;
- its definition identity;
- hidden edge count;
- source participation;
- terminal participation;
- expansion information.

This splice must happen per occurrence. It must happen before any optional
definition consolidation.

## 9.3 Transparency evidence

A component may be treated as transparent when evidence shows that it:

- primarily forwards children;
- adds layout or presentation;
- does not read feature context;
- does not load data;
- does not perform domain transforms;
- does not create important state;
- does not select meaningful variants;
- belongs to a configured design-system family.

A name or folder alone is not sufficient proof. Known design-system components
may seed the policy, but code behavior should support the choice.

## 9.4 Honest counts

The overview should distinguish:

- unique component definitions;
- static render occurrences;
- hidden wrapper occurrences;
- repeated collection occurrences;
- terminal occurrences.

An example summary:

```text
42 definitions · 86 occurrences · 31 hidden UI wrappers
14 repeated collection sites · 63 terminals
```

The main visual density should represent occurrences, not definitions.

## 10. Default route experience

## 10.1 Initial view

The initial route graph should show:

- all proven origins;
- all proven component occurrences;
- important runtime and framework boundaries;
- all proven terminals or terminal marks;
- render connectivity;
- data connectivity;
- explicit proof gaps;
- hidden detail counts.

The graph should not show by default:

- operation nodes;
- full type shapes;
- code snippets;
- finding lists;
- native DOM structure;
- every generic UI wrapper;
- evidence cards.

## 10.2 Visual hierarchy

At a low zoom level:

- every included occurrence remains a visible mark;
- every origin remains visible;
- every major boundary remains visible;
- labels may disappear;
- connectivity remains readable;
- source and terminal presence remain distinguishable.

At a closer zoom level:

- component names appear;
- reuse markers appear;
- hidden wrapper counts appear;
- terminal summaries appear;
- boundary labels appear.

## 10.3 Selection

Selecting an origin should:

- retain the full route layout;
- emphasize only proven paths from that origin;
- fade unrelated paths;
- show participating fields when proven;
- show gaps without inventing connections;
- populate the inspector.

Selecting an occurrence should show:

- definition and call-site identity;
- incoming origins;
- incoming and outgoing data relationships;
- render parent and children;
- boundary crossings;
- terminals;
- hidden path details;
- source code;
- related findings;
- all other occurrences of the same definition.

Selecting a terminal should support a backward contributor slice.

## 10.4 Isolation

Isolation is an explicit user choice.

It may retain only:

- nodes on the selected path;
- summarized incoming boundary stubs;
- summarized outgoing boundary stubs;
- selected hidden-path expansions.

Isolation must not change the underlying evidence or node identities.

## 10.5 Code inspection

Code should usually appear outside the graph.

The inspector can show:

- the exact source span;
- nearby code;
- the containing function or component;
- input and output type summaries;
- previous and next evidence;
- links to the full file view.

A code-focused mode may show trace-related snippets from several files. Files
become one grouping option instead of the only code organization.

## 10.6 Findings

Findings should remain optional.

The default graph may show a quiet marker, ring, or color cue. The full finding
should appear only after selection.

A future finding overlay may highlight:

- the responsible operation sequence;
- all affected occurrences;
- all affected terminals;
- shared upstream causes;
- confidence and disproof conditions.

## 11. Type and transform view

The type-transform product remains important. It is deferred from the first
route rewrite slice.

The same evidence model should later support a type-first projection.

The route view asks:

> Where did this data come from, and where did it go?

The type view asks:

> What shape did this data have at each step?

Important future capabilities:

- canonical type identity;
- compiler-linked derivatives;
- disconnected mirror detection;
- field selection;
- nested field selection;
- field rename;
- object pack and spread;
- list-to-item and item-to-list changes;
- aggregation;
- parsing and validation;
- scalar narrowing;
- type restoration through lookups;
- field loss and later recovery;
- repeated normalization and defaulting.

Example:

```text
ApiUser
  → select user_id and display_name
  → rename user_id to id
  → trim display_name
  → UserSummary
```

Field lineage:

```text
ApiUser.user_id      → UserSummary.id
ApiUser.display_name → trim → UserSummary.name
```

The first rewrite should avoid destroying evidence needed for this later view.
It does not need to solve field provenance in full.

## 12. Client and server boundaries

The default full-stack route view should treat client and server as one system
when both sides exist in the repository.

Exact bridge evidence may include:

- a resolved shared endpoint constant;
- a static URL and method match;
- a framework-generated client and handler identity;
- a shared RPC declaration;
- a direct server-action reference.

A shared repository authorizes the search. It does not prove the match.

If no exact bridge exists, show two honest edges:

```text
client request → external boundary
API handler ← external caller
```

Do not connect them through matching names or similar types.

## 13. Proposed architecture seams

The desired flow is:

```text
project loading
  → program evidence
  → scope discovery
  → slice query
  → semantic projection
  → transport DTO
  → graph layout and interaction
  → inspector and code view
```

## 13.1 Project loading

`src/project` should continue to own:

- project discovery;
- TypeScript configuration;
- program creation;
- source containment.

It should not own route or trajectory meaning.

## 13.2 Program evidence

`src/analysis` should own:

- stable code identity;
- program elements and relations;
- trace proof;
- source occurrences;
- render occurrences;
- boundary evidence;
- operation evidence;
- gaps and coverage.

The existing graph and trace records should seed this layer. The rewrite should
not discard sound compiler and source evidence.

## 13.3 Scope adapters

Framework and application adapters should live in focused analysis modules.

Each adapter should expose scope candidates and seeds. It should not emit UI
DTOs or graph coordinates.

## 13.4 Slice query

A dedicated analysis module should own:

- forward and backward reachability;
- route or command inclusion;
- origin and terminal roles;
- boundary-crossing policy;
- proof gaps;
- coverage summaries;
- occurrence-aware path identity.

The same module should serve every adapter.

## 13.5 Server projection

`src/api/projections` should convert an evidence slice into a semantic display
model.

It should own:

- component occurrence projection;
- transparent wrapper contraction;
- hidden path summaries;
- origin and terminal summaries;
- selection-ready evidence indexes;
- compact transport shaping.

It should not own SVG coordinates or browser state.

Proof-sensitive projection should not be reconstructed in the browser.

## 13.6 Transport contracts

`src/api/contracts.ts` should validate the new scope inventory and slice DTOs.

Possible top-level contracts:

```ts
type ScopeInventoryDto = {
  scopes: ScopeSummaryDto[];
};

type FlowSliceDto = {
  scope: ScopeSummaryDto;
  nodes: ProjectedNodeDto[];
  edges: ProjectedEdgeDto[];
  origins: OriginDto[];
  terminals: TerminalDto[];
  gaps: EvidenceGapDto[];
  coverage: CoverageDto;
  evidence: EvidenceIndexDto;
};
```

These names are placeholders. The contract should not be called route data if
it also serves CLIs and endpoints.

## 13.7 Frontend graph model

The browser should own:

- layout;
- zoom and pan;
- label visibility;
- selection;
- isolation;
- local expansion;
- inspector state;
- finding overlay state;
- code surface state.

The browser should not decide:

- route membership;
- source membership;
- field lineage;
- bridge identity;
- transparent-wrapper semantics;
- evidence confidence.

The current graph interaction work may remain useful. Its semantic input model
should be replaced.

## 14. Current system and gaps

## 14.1 Useful current foundations

The repository already has substantial foundations:

- TypeScript program loading;
- JSX sink discovery;
- backward expression tracing;
- graph nodes and edges;
- compiler identity evidence;
- source locations;
- route discovery;
- resource and HTTP bridge analysis;
- exhaustive route graph work;
- component graph layout and interactions;
- source selection;
- code and finding views;
- local URL state.

These are partial foundations. They do not yet form one evidence truth.

## 14.2 Current split models

The current route experience combines several models:

1. A general backward JSX sink graph.
2. A semantic route-operation model.
3. An exhaustive route graph with handoff stitching.
4. A client-side component topology projection.

These models can disagree about:

- which source belongs to a route;
- which path is proven;
- which consumer owns a read;
- which component participates;
- whether a resource handoff exists;
- how a shared component should appear.

## 14.3 `readFile` regression

The observed route source picker advertises a migration `readFile` occurrence.
The exact selected-source paths are empty. A broad resource fallback then makes
the source appear related to several resources.

The likely causes are:

- route source membership comes from the semantic operation trajectory;
- the selected source has no exact exhaustive path;
- source identity has lost its specific consumer occurrence;
- a browser fallback treats the missing consumer as a broad match;
- the detail panel displays the broad `string` shape and its methods.

This is a model ownership failure. A unified evidence slice should make an empty
exact path visible instead of substituting a broad resource match.

## 14.4 Shared component regression

The current component topology can render one component definition and connect
several callers to it.

For generic components, this creates false visual joins. Hiding the shared node
can then attach its combined children to unrelated callers.

The rewrite must use occurrence identity before hidden-component projection.

## 14.5 Existing plan conflicts

The existing first vertical slice treats a 6–15 operation chain as the main
trajectory view. This should become a detail mode.

The new default should show the complete route occurrence surface.

The existing plan also gives durable URL state a larger role than current
product needs require. Refresh stability remains useful. Shared-link stability
does not.

## 15. Rewrite safety strategy

The rewrite should be additive before it becomes destructive.

## 15.1 Build a shadow evidence path

Create the new evidence and slice model beside the current route analysis.

Do not make the first implementation serve every existing DTO.

The shadow model should produce inspectable structured output for selected
fixtures before it drives the main UI.

## 15.2 Prove one vertical slice

The first slice should answer:

> Can a user open the Pluck route and see every proven origin, occurrence,
> connection, and terminal without false shared-component joins?

Required capabilities:

- route seed;
- occurrence expansion;
- exact source occurrences;
- render relationships;
- data relationships;
- resource and context boundaries;
- transparent-wrapper projection;
- terminal marks;
- proof gaps;
- code evidence.

## 15.3 Compare old and new semantics

Comparison should focus on meaning, not exact counts or coordinates.

Inspect:

- sources included by each model;
- component definitions and occurrences;
- terminal coverage;
- exact source paths;
- hidden wrapper behavior;
- unexplained gaps;
- payload size;
- analysis time.

The old model is not the expected truth. Differences require explanation, not
automatic parity.

## 15.4 Cut over one projection

When the Pluck route and small fixtures behave well, make the new component
projection available in the UI.

Keep the old route view temporarily available for comparison. Do not maintain
both as long-term products.

## 15.5 Remove obsolete paths

After the new projection becomes the accepted route view, remove:

- semantic operation trajectories used as route membership;
- broad source fallback behavior;
- client-side proof reconstruction;
- definition-merged component topology;
- evidence-card presentation;
- the separate component structure product;
- obsolete route-only DTOs.

## 16. Example projects

Add small product fixtures under `examples/`.

Suggested projects:

1. `solid-route`
2. `solid-full-stack`
3. `node-cli`
4. `http-service`
5. `serverless-handler`

Each example should use one comparable domain story:

```text
load records
  → validate
  → select or pack fields
  → present or return records
  → perform one side effect
```

The examples should remain understandable by inspection. They should not exist
only as small syntax fixtures.

Each example should answer:

- What is the selected scope?
- What are the true origins?
- Which occurrences or functions participate?
- What are the terminals?
- Which runtime boundaries are crossed?
- Which relationships are proven?
- Where does proof stop?
- Does the same projection and inspector work without special UI code?

These are product fixtures first. Automated regression tests can follow after
the user approves test work.

## 17. Reference scenarios

## 17.1 Pluck route overview

The main robustness scenario is the saved-capture route.

The graph should expose a path similar to:

```text
captureId route input
  → persisted JSON and related files
  → parse and validation
  → capture detail construction
  → resources and available-detail selection
  → route shell
  → viewer workspace and context
  → stage, layer, and inspector occurrences
  → render terminals
```

The default graph should emphasize occurrences and connectivity, not the listed
operations.

Acceptance points:

- every proven persisted read appears as an origin occurrence;
- unrelated `readFile` calls do not appear;
- all proven participating occurrences remain represented;
- generic UI wrappers do not join unrelated branches;
- hidden wrappers retain local child ownership;
- source selection highlights exact paths;
- context traversal does not imply false field lineage;
- summary and full-detail selection appears as a conditional handoff;
- gaps are visible;
- code opens from the inspector;
- the graph reports definitions and occurrences separately.

## 17.2 Solid route example

The simple route should prove:

- route discovery;
- one layout or shell;
- more than one source;
- component occurrence expansion;
- source isolation;
- render terminal coverage;
- transparent layout wrappers.

## 17.3 Full-stack example

The full-stack example should prove:

- client request;
- exact handler bridge;
- server read;
- response serialization;
- client resource result;
- component use;
- render terminal;
- one missing bridge shown as a gap or external boundary.

## 17.4 CLI example

The CLI example should prove:

- command entry discovery;
- argument and environment input;
- file or network origin;
- parsing and field selection;
- standard output;
- file or network side effect;
- no dependency on route or component concepts.

## 17.5 HTTP service example

The service example should prove:

- endpoint discovery;
- request input;
- validation;
- persistence read or write;
- response terminal;
- external consumer boundary.

## 17.6 Serverless example

The serverless example should prove:

- framework handler discovery;
- event input;
- one external read;
- one external effect;
- response or completion terminal.

## 18. Performance and scale

The first performance target is a project between 10,000 and 100,000 lines.

The current experience can take about 20 seconds on a large local project. That
is an acceptable initial reference, not a permanent target.

The design should avoid requiring one fully materialized visual graph for the
whole program.

Preferred scale boundaries:

- collect reusable program evidence once per analysis generation;
- discover scope inventories from that evidence;
- build detailed slices on request or in bounded batches;
- send only the active slice to the browser;
- keep large type shapes referenced and shallow;
- retain exact totals when the UI collapses nodes;
- use deterministic analysis budgets;
- report budget exhaustion as a gap;
- cache pure slice and projection results when useful.

Performance is part of correctness. A complete analysis that stalls ordinary
projects does not serve the product job.

## 19. Local state and navigation

This is a single-developer local tool.

The product does not currently need:

- public shared links;
- collaborative state;
- durable server-side sessions;
- compatibility with old route URLs.

Refresh should normally retain:

- selected scope;
- selected origin or occurrence;
- isolation state;
- visible projection;
- useful zoom and pan state;
- explicitly expanded hidden paths.

Small temporary details do not need full persistence.

State keys should use semantic identities within one analysis generation where
possible. Invalid state after source changes should clear quietly.

## 20. Current capability audit

| Capability | Status | Current evidence | Main gap |
| --- | --- | --- | --- |
| TypeScript program loading | Implemented | `src/project` and current analysis pipeline | None for this rewrite seam |
| JSX render sink discovery | Implemented within scope | `src/analysis/source-sinks.ts` | Not a general terminal model |
| Backward expression tracing | Implemented within scope | `src/analysis/source-trace.ts` | Does not form the full scope-neutral slice |
| General graph evidence | Implemented foundation | `src/analysis/graph.ts` and analyzer types | Several later models reinterpret it |
| Route discovery | Partial | `src/analysis/route-discovery.ts` | Adapter and scope contracts are route-specific |
| Route source analysis | Partial and regressed | `src/analysis/route-data.ts` | Source membership can differ from exact paths |
| Exhaustive route paths | Partial | `src/analysis/route-data-trajectories.ts` | Needs one shared slice contract and occurrence identity |
| Resource boundaries | Partial | `src/analysis/route-data-resource.ts` | Broad fallback can overstate source participation |
| HTTP bridges | Partial | `src/analysis/route-data-http.ts` | Must remain exact and scope-neutral |
| Component topology | Partial proxy | frontend component-topology modules | Merges definitions and reconstructs proof in the browser |
| Hidden UI projection | Partial | `hidden-component-projection.ts` | Must splice local occurrences before any merge |
| Source lens | Partial and unsafe | `topology-source-lens.ts` | Fallback may highlight unrelated consumers |
| Code viewer | Implemented and valuable | file and code-map surfaces | Remains primarily file-oriented |
| Findings | Implemented and valuable | analyzer findings and file UI | Need graph attachment and impact projection |
| Type identity | Partial foundation | expression identity evidence | No complete shape or field lineage |
| Type-transform view | Planned only | type-flow plans and transcripts | Deferred from first rewrite slice |
| CLI and endpoint slices | Absent as shared product model | incidental graph evidence only | Need adapters over one slice query |
| Write and reconciliation flow | Absent for product goal | event sinks and partial calls | Deferred |

## 21. Delivery sequence before executable plan splitting

This sequence records dependencies. Each stage still needs a smaller executable
plan with its own verification method.

### Stage 0 — Freeze the semantic contract

Define:

- program element identity;
- program relation identity;
- component definition and occurrence identity;
- origin and terminal roles;
- proof kinds;
- gap reasons;
- scope adapter contract;
- slice query contract;
- component projection contract.

Decision gate:

- Can all five example applications use the contracts without special graph
  models?

### Stage 1 — Add example applications

Create the five small examples. Record expected origins, paths, boundaries, and
terminals by hand.

Decision gate:

- Do the examples expose missing concepts before production code changes begin?

### Stage 2 — Build occurrence identity

Produce route-specific component call-site occurrences with caller, slot, and
repetition evidence.

Decision gate:

- Can the model expand `HStack` uses without joining unrelated children?

### Stage 3 — Build the shared slice query

Join render participation, data relationships, origins, terminals, boundaries,
and gaps into one evidence slice.

Decision gate:

- Does `readFile` appear only when an exact occurrence reaches the route?

### Stage 4 — Build the component projection

Project the slice into occurrence nodes and typed edges. Add local transparent
wrapper contraction and exact hidden-path summaries.

Decision gate:

- Does the Pluck route remain complete and readable without false shared joins?

### Stage 5 — Add the new route workspace

Render the component-first overview. Add selection, source emphasis, isolation,
zoom labels, terminal marks, gaps, and the inspector.

Decision gate:

- Can a user explain route totality and trace one source within five minutes?

### Stage 6 — Add non-route adapters

Apply the same slice and projection model to the CLI, API, and serverless
examples.

Decision gate:

- Does any adapter require private trajectory logic or UI behavior?

### Stage 7 — Cut over and remove obsolete models

Replace the current route workspace after product review. Remove duplicate
membership, fallback, component topology, and evidence-card paths.

Decision gate:

- Are all retained route claims backed by the new slice evidence?

### Stage 8 — Plan the next product layer

Choose among:

- type and field flow;
- findings overlay;
- write and reconciliation paths;
- repository overview;
- component-local breakdown.

This choice should follow actual use of the new route overview.

## 22. Verification strategy

Verification should test product meaning before exact rendering.

Each executable stage should include:

- a hand-written expected scenario;
- structured output inspection;
- a visual review when UI exists;
- performance timing;
- gap review;
- comparison against known source locations;
- confirmation that no speculative edge appeared.

Important semantic assertions include:

- occurrence identity survives shared definitions;
- every visible render occurrence normally has one render parent;
- caller-owned children remain attached to their caller path;
- transparent wrappers splice locally;
- source selection uses exact occurrence paths;
- hidden paths preserve counts and evidence;
- terminal roles depend on scope;
- client-server bridges require exact proof;
- budget limits create gaps instead of invented edges;
- no adapter creates a second evidence graph.

Repository policy requires explicit user approval before test changes. Initial
product iteration should use lint, type checking, structured inspection, and
manual exercise. Test work should receive a separate approval and plan.

## 23. Risks and tensions

## 23.1 Totality versus readability

The overview should retain all proven branches. A large route may still become
visually dense.

The response should be semantic collapse, zoom labels, fading, and explicit
isolation. It should not be arbitrary branch removal.

## 23.2 Occurrence expansion versus graph size

Occurrence identity prevents false joins. It can also duplicate large shared
subtrees.

The default should preserve separate occurrence roots and collapse repeated
subtrees. Definition-level consolidation should remain explicit.

## 23.3 Static possibility versus runtime reality

Static analysis may find conditional components or collection call sites. It
usually cannot count runtime instances or know which dynamic branch executes.

The graph should label static occurrence, repetition, condition, and opacity.
It should not present static possibility as observed runtime behavior.

## 23.4 Exact proof versus useful full-stack joining

Users benefit when client and server paths connect. Loose matching creates
high-cost false claims.

Exact bridge adapters should grow over time. Unsupported bridges should remain
visible gaps.

## 23.5 One evidence model versus eager universal analysis

One semantic truth does not require one huge eager graph payload.

The program evidence layer may use indexes and lazy computation. The slice
contract is the stable product seam.

## 23.6 Route priority versus general scope support

Route analysis should receive the best product design and deepest early
coverage. The core model must still avoid route fields and route-only roles.

The example applications are the guardrail.

## 23.7 Future type needs versus first-slice speed

The first slice should retain symbol and type identity. It should not delay the
route overview while solving complete field provenance.

## 23.8 Evidence preservation versus obsolete compatibility

The rewrite may remove DTO and UI compatibility. It should preserve sound
compiler and source evidence from the current analyzer.

## 24. Assumptions

- The primary user is the repository author or a developer exploring local code.
- The first supported repositories are TypeScript and TSX projects.
- Static analysis is the primary truth source.
- One repository often contains enough client and server code for a useful join.
- A route's static component occurrence surface is useful even without runtime counts.
- Current analysis speed is acceptable for the initial rewrite baseline.
- Product behavior matters more than compatibility with current experiments.
- The current component graph interaction work can be reused selectively.
- The exact final schema will change during vertical-slice work.

## 25. Non-goals for the first rewrite slice

- A complete whole-repository architecture model
- Runtime tracing
- Exact runtime component instance counts
- A type-first graph
- Full field provenance
- Mutation reconciliation
- Automated refactoring advice
- Public sharing
- Collaboration
- Durable cross-generation graph IDs
- Pixel-stable layouts
- Support for every framework
- Backward compatibility with current API contracts
- Preservation of the component structure view
- Preservation of evidence cards
- Test-suite changes without separate approval

## 26. Open product questions

These questions should not block the raw plan. They can become decision gates in
smaller plans.

1. Which component occurrences deserve terminal marks instead of explicit DOM
   terminal nodes?
2. Which exact facts make a design-system component transparent?
3. How should repeated large subtrees appear before expansion?
4. Which source categories need distinct default colors or marks?
5. How should the overview show a route with no proven external origin?
6. Should URL parameters appear as origins, entry inputs, or a separate class?
7. How should context and global state differ visually?
8. What exact bridge evidence is sufficient for automatic client-server joining?
9. Which gap kinds deserve visible stubs at the overview level?
10. What amount of local state should survive a changed analysis generation?
11. Which Pluck route terminals provide the best first acceptance sample?
12. What measured payload and layout limits keep the browser responsive?

## 27. Opportunity backlog

### Type-flow projection

Show data shapes and field bundles as the main visible units. Trace plucks,
packs, renames, list changes, and type restoration.

### Context-departure analysis

Start at a context field. Group the first meaningful operations after each
consumer reads it. Reveal repeated derivation.

### Component-local breakdown

Analyze one large component. Relate reactive blocks and local transforms to DOM
regions. Suggest possible extraction seams only when evidence supports them.

### Finding impact overlay

Select one finding and reveal its affected operations, occurrences, sources,
and terminals over the main graph.

### Read-write-reconcile lifecycle

Trace data from persistence into rendering, through user action, back to a
write, and through refresh or optimistic reconciliation.

### Repository application atlas

Show routes, commands, endpoints, packages, services, and major data boundaries.
Use it as an index into the same scope slices.

### Runtime augmentation

Join optional runtime counts and executed paths with static evidence. Keep the
two evidence classes distinct.

### Agent work packets

Export selected scope, path, code, findings, gaps, and acceptance facts for a
coding agent.

## 28. Candidate executable plan split

The next planning exercise should split this document into small plans with one
product proof each.

Suggested plan boundaries:

1. **Example application pack**
2. **Program evidence contract**
3. **Component occurrence and slot identity**
4. **Scope adapter contract**
5. **Shared evidence-slice query**
6. **Origin and terminal classification**
7. **Exact client-server bridge policy**
8. **Transparent UI occurrence projection**
9. **Component-first route DTO**
10. **Route graph workspace**
11. **Selection and source isolation**
12. **Evidence and code inspector**
13. **CLI adapter proof**
14. **API and serverless adapter proof**
15. **Old route-model removal**
16. **Post-cutover product review**

Each plan should define:

- one user outcome;
- current code ownership;
- schema changes;
- files likely to change;
- explicit exclusions;
- manual verification steps;
- static checks;
- performance evidence;
- a decision gate;
- test work, only after separate approval.

## 29. Raw plan completion criteria

This raw plan is ready to split when it captures:

- the main route product job;
- non-route scope requirements;
- component occurrence identity;
- generic UI contraction semantics;
- origin and terminal roles;
- proof and gap policy;
- progressive disclosure;
- code and finding placement;
- future type-flow needs;
- current-system gaps;
- rewrite safety;
- fixtures;
- scale constraints;
- risks;
- non-goals;
- delivery dependencies;
- acceptance scenarios.

This document does not authorize implementation. Its next use is to produce a
set of smaller, executable, and independently verifiable plans.
