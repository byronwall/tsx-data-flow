# Context-Driven Data Flow: Transcript Decomposition

## Purpose and source

This document decomposes the July 24, 2026 voice memo about the Pluck capture
route and `tsx-data-flow`'s component-topology view.

Source:

- recorded 2026-07-24 at 21:10;
- package:
  `/Users/byronwall/.v2c-voice-memos/20260724-211009-8BEB1114-context`;
- transcript:
  `transcript/transcript.srt`;
- duration: 34:49.

The memo says “TFX data flow” near the beginning. The surrounding examples and
the project context establish that `tsx-data-flow` is intended.

This is product discovery and current-state documentation. It does not authorize
or describe an implementation already completed.

## Executive synthesis

The current source filter stops being discriminating when nearly every
component consumes one broad context object. That is not evidence that context
usage is wrong. It is evidence that the selected analytical grain is too broad.

The memo identifies three related but distinct products:

1. **End-to-end source topology** answers which persisted sources reach which
   components and terminals. It remains useful when a route has several sources,
   when overlapping getters may be redundant, and for general orientation.
2. **Context-departure analysis** starts at a context value or field and asks
   what happens immediately after each consumer reads it. Its main purpose is to
   reveal repeated projections, transformations, helpers, and prop relays
   without drawing the same source-to-component edge dozens of times.
3. **Component breakdown analysis** starts with a large component and asks
   whether its reactive blocks and DOM regions reveal safe extraction seams.
   This can detect the suspected problem directly without requiring an
   end-to-end source trace.

The strongest near-term move is not to replace the existing topology. It is to
add a field-refined, context-outward lens:

```text
context value
  -> selected field
  -> first operation after each read
  -> repeated operation groups with counts and locations
  -> component or terminal boundary
```

This lens should prove whether a broad context is being used sensibly, whether
the same derivation is repeated, and where feature data becomes display-ready
input. A separate component-breakdown feature should remain in the backlog until
the product explicitly chooses direct smell detection over investigation.

## Jobs and desired outcomes

### J01 — Recover discrimination when a broad context reaches everything

**Actor:** Developer investigating a route

**When** most components consume the same context object,
**I want to** refine the flow by a field or derived value,
**so I can** see meaningful differences among consumers instead of lighting the
entire component tree.

**Success looks like**

- selecting `page.borders` or another field leaves only its proven paths active;
- the view distinguishes “field not used here” from “field identity not proven”;
- the unrefined source view remains available for routes where source-level
  separation is already informative.

**Evidence**

- 00:01:31–00:02:09 — the capture source flows through context, but every
  component lights up;
- 00:02:34–00:03:54 — the object-level view says little, while field-level use
  may differ;
- 00:04:32–00:06:03 — source filtering is still useful on ordinary routes, with
  field tracing as additional machinery for this case.

**Implications, not commitments**

- make proven source fields selectable;
- support nested-field refinement progressively rather than rendering every
  field path at once.

**Confidence:** Explicit

### J02 — Understand what consumers do after reading context

**Actor:** Developer reviewing context ownership

**When** a context value is consumed in many components,
**I want to** see the first meaningful operation after each read and where the
result goes,
**so I can** distinguish direct healthy rendering from repeated or unnecessary
transformation.

**Success looks like**

- direct field-to-render use is summarized as unsurprising;
- repeated calls such as `extractBorders(page)` are grouped by operation and
  counted across consumers;
- each group retains component and source locations;
- the user can continue from an intermediate result to its next operations.

**Evidence**

- 00:08:12–00:09:50 — broad context use is acceptable unless consumers repeat
  the same transformations;
- 00:18:48–00:20:51 — the useful question becomes what happens as variables
  leave context;
- 00:20:51–00:22:38 — the memo proposes grouping repeated field-to-function
  patterns and showing counts and locations.

**Implications, not commitments**

- model a `context-read -> first operation` boundary;
- aggregate equivalent operations without discarding evidence;
- allow a repeated derived value to become the next selected origin.

**Confidence:** Explicit

### J03 — Distinguish healthy feature-to-UI boundaries from suspicious work

**Actor:** Developer reviewing component responsibilities

**When** feature data is transformed and handed to a reusable display component,
**I want to** see that handoff as an intentional boundary,
**so I can** focus upstream on questionable shaping rather than expanding a
display-only subtree.

**Success looks like**

- a typography renderer or design-system component can be summarized once its
  input has the expected shape;
- the final field extraction or transformation before the boundary remains
  visible;
- a boundary is not hidden when it owns a fallback, normalization, or other
  meaningful transformation.

**Evidence**

- 00:10:09–00:12:04 — passing prepared props into general-purpose UI is
  presented as desirable, while feature context inside that UI is undesirable;
- 00:14:15–00:16:38 — the typography sample subtree is uninteresting once it
  receives the right shape;
- 00:33:17–00:34:31 — UI folders and common helpers are suggested as terminal or
  summarization signals, with examples still needed.

**Implications, not commitments**

- use conservative, explainable terminal heuristics;
- never equate folder location alone with a safe boundary.

**Confidence:** Explicit job; inferred success criteria

### J04 — Find repeated work that belongs at a shared boundary

**Actor:** Developer refactoring a feature

**When** several context consumers derive the same intermediate result,
**I want to** see the shared cause and all affected consumers,
**so I can** decide whether to compute the result once in context or a common
helper.

**Success looks like**

- equivalent field-plus-operation sequences are grouped;
- the report distinguishes repeated syntax from a shared helper called many
  times;
- the recommendation identifies the smallest responsible boundary rather than
  automatically moving work into context.

**Evidence**

- 00:09:06–00:09:50 — repeated transformations may deserve one shared
  computation;
- 00:20:46–00:22:38 — `extract borders from page` repeated 30 times is the
  concrete example;
- 00:31:57–00:32:22 — identical context usage becomes easier to recognize after
  oversized components are separated.

**Implications, not commitments**

- add operation fingerprints with field identity, resolved function identity,
  and call-site evidence;
- treat “compute once in context” as one option, not an automatic fix.

**Confidence:** Explicit

### J05 — Locate extraction seams inside oversized components

**Actor:** Developer changing a large component

**When** one component contains several reactive blocks and unrelated DOM
regions,
**I want to** see which local data dependencies feed which regions,
**so I can** split responsibilities without breaking adjacent concerns.

**Success looks like**

- the tool identifies large components with many local reactive blocks and
  nested scopes;
- dependency coloring reveals a memo or effect that serves only one DOM region;
- a written report names plausible seams and the evidence behind them.

**Evidence**

- 00:16:38–00:18:11 — direct component-complexity detection may be better than
  tracing every source to find the same problem;
- 00:28:08–00:30:55 — a 400-line component may contain independently movable
  data/DOM regions;
- 00:30:56–00:31:57 — the memo explicitly calls this a separate “component
  breakdown” feature and proposes a written report.

**Implications, not commitments**

- retain this as an adjacent work stream;
- do not force scope/container nodes into the route topology.

**Confidence:** Explicit

### S01 — Preserve static-analysis truth boundaries

**Actor:** Analysis system

The system must not conclude that calls using the same type return the same
runtime object. It should use resolved symbols, arguments, and static identity
where available, then label instance equivalence as unknown when runtime
evidence would be required.

**Evidence**

- 00:23:42–00:24:48 — overlapping persistence entry points may be redundant;
- 00:24:50–00:25:51 — equal types or method names do not prove equal runtime
  instances; the employee/manager example makes the distinction explicit.

**Confidence:** Explicit

## Themes and work streams

## Theme: Adaptive analytical grain

**Why it matters:** A useful overview cannot use one grain for every route.
Source-level filtering works when sources partition the tree, but fails when one
broad context dominates.

**Related jobs:** J01, J02

**What the transcript describes**

- keep source-level filtering as the default orientation;
- expose type fields and let the user refine the selection;
- trace a chosen field through deep nesting when requested;
- avoid displaying every field and every arrow simultaneously.

**Current baseline**

- Source selection is implemented.
- Source shapes and proven top-level field participation are visible.
- A field is not yet independently selectable as the topology origin.

**Tensions and unknowns**

- arbitrary nested-field support is directionally endorsed but has no depth,
  aliasing, collection-element, or computed-property rules;
- source-field labels can create false confidence unless non-participation and
  incomplete field identity remain distinct.

**Strongest next move**

- add one selected top-level field to the existing source lens and verify it on
  Pluck's broad page/capture context before expanding to arbitrary field paths.

## Theme: Context departure and repeated derivation

**Why it matters:** Once context shortens the source-to-consumer path, the
interesting complexity begins at each read rather than at the persisted source.

**Related jobs:** J02, J04, S01

**What the transcript describes**

- begin at a selected context value or field;
- record its first meaningful downstream operation;
- aggregate repeated operations and show counts and locations;
- allow inspection to continue from an intermediate result;
- stop at a useful component/render boundary.

**Current baseline**

- The source lens retains a bounded transform inventory and maps transforms to
  components when it can.
- It does not model context-read departures as a first-class grouped entity.

**Tensions and unknowns**

- repeated calls may be intentional, cheap, or parameterized differently;
- moving a derivation into context increases context responsibility and may
  create unwanted recomputation or coupling;
- equivalent syntax is weaker evidence than equivalent resolved function,
  arguments, and upstream value identity.

**Strongest next move**

- create an evidence-only repeated-departure report before adding automated
  refactoring advice.

## Theme: Semantic boundaries and graph reduction

**Why it matters:** The route view must represent all meaningful trajectories
without rendering every deep display subtree.

**Related jobs:** J03, J01

**What the transcript describes**

- treat correctly shaped input to reusable UI as a terminal boundary;
- treat extracted helpers as collapsible input/output boundaries;
- use conventions such as UI folders cautiously;
- consider a simple default depth limit with expansion if semantic rules are
  not yet reliable.

**Current baseline**

- Shared component and context hubs are summarized.
- Known icon packages receive special summarization.
- Existing plans already require common display terminals to be collapsible
  while retaining final value extraction.

**Tensions and unknowns**

- a common component may own the exact fallback or formatting under
  investigation;
- a fixed hop limit is predictable but semantically arbitrary;
- helper extraction can improve readability without reducing the underlying
  computational flow.

**Strongest next move**

- reuse the existing conservative collapse policy, then add a visible reason and
  hidden trajectory count for every summarized terminal family.

## Theme: Investigation versus diagnosis

**Why it matters:** A graph for understanding data flow and a detector for
finding refactoring opportunities have different roots, evidence, and success
criteria.

**Related jobs:** J02, J05

**What the transcript describes**

- source-to-sink analysis supports investigation and application orientation;
- component metrics and local dependency regions may detect jumbo-component
  problems more directly;
- scope-level containers do not necessarily improve understanding of how data
  moves.

**Current baseline**

- The route plan explicitly optimizes for route complexity and trajectory
  inspection.
- The analyzer already emits several cleanup-oriented reports, but the inspected
  route topology has no dedicated intra-component breakdown model.

**Tensions and unknowns**

- the product has not decided whether the next priority is explaining code or
  recommending changes;
- mixing both goals risks interpreting every long or busy path as a defect.

**Strongest next move**

- label context departure as an investigation lens; validate it before deriving
  a repeated-work finding from the same evidence.

## Scope and commitment levels

| Idea or capability | Related jobs | Commitment | Current state | Recommended treatment |
| --- | --- | --- | --- | --- |
| Keep source-level route filtering | J01 | Decided direction | Implemented | Preserve as the default route lens |
| Show source type and fields | J01 | Current baseline | Implemented | Preserve |
| Select a top-level field as the flow origin | J01 | Decided direction | Partial/proxy | First slice |
| Trace arbitrary nested fields | J01 | Near-term candidate | Absent as a user selection | Add only after top-level proof |
| Dedicated context-usage/context-departure view | J02, J04 | Near-term candidate | Partial/proxy | Prototype after field selection |
| Group repeated field-to-operation departures | J04 | Near-term candidate | Absent | Evidence report before advice |
| Automatically compute repeated derivations in context | J04 | Exploratory branch | Absent | Decision option, not default |
| Collapse display-only UI subtrees | J03 | Decided direction in existing route plan | Partial/proxy | Extend conservatively |
| Default ten-hop depth limit | J03 | Parked/cautioned idea | Absent | Fallback only if semantic reduction fails |
| Dedicated component-breakdown visualization/report | J05 | Exploratory branch | Partial/proxy | Separate backlog |
| Runtime instance tracing | S01 | Parked/out of current static scope | Absent | Do not imply; consider runtime integration separately |

## Described solutions and changes

These are proposed mechanisms, not additional jobs:

1. Turn displayed source-field chips into a refinement control.
2. Build a field-specific subgraph from already-proven source trajectories.
3. Introduce a context-departure projection that groups the first meaningful
   operation after each context read.
4. Fingerprint repeated departures using upstream value/field, resolved
   operation identity, and statically visible arguments.
5. Show count, component, file, and line for each repeated group.
6. Let a derived value become the origin for the next inspection step.
7. Treat reusable display components and extracted helpers as collapsible
   boundaries when no meaningful operation would be hidden.
8. Build a separate component report from local reactive blocks, nested scopes,
   and DOM dependency regions.

## Current-state and gap audit

Audit date: 2026-07-24. This section describes the checked-out repository. The
existing unrelated modifications under `src/analysis` were not changed.

| Capability needed by a job | Status | Evidence | Gap or caution |
| --- | --- | --- | --- |
| Select one route data source | Implemented | `TrajectorySourcePicker.tsx:30-56` selects a source key and lists concrete reads. | The control has no field selection state. |
| Display source type and fields | Implemented | `TrajectorySourcePicker.tsx:34-55` and `ComponentTopologyInspector.tsx:20-25` render type/field evidence. | Display alone does not refine the graph. |
| Detect proven top-level fields per component | Partial/proxy | `topology-source-lens.ts:75-112` retains property/optional reads only on already-proven source trajectories. | It aggregates field labels onto components; it does not create a field-selected origin or preserve nested field paths. |
| Show source-rooted transforms | Partial/proxy | `topology-source-lens.ts:31-70` projects the selected source graph and attaches retained transforms and terminals. | The transform inventory is bounded and recognizes only a narrow set of operation kinds; it is not a context-departure model. |
| Distinguish proven from unavailable lineage | Implemented | `ComponentTopologyChrome.tsx:20-30` and `ComponentTopologyInspector.tsx:20-26` state when paths or handoffs are not proven. | New field/context views must retain these truth labels. |
| Summarize shared contexts and common components | Partial/proxy | `component-topology-model.ts:111-169` summarizes reused components, contexts, and known icon packages. | Reuse and folder/package conventions do not prove display-only behavior. |
| Switch between topology and detailed paths | Implemented | `ComponentTopologyChrome.tsx:18-22` exposes topology and detailed-path modes. | Neither mode begins specifically at a context departure. |
| Group repeated context-read operations | Absent | No such entity exists in the inspected source-lens or component-topology models. | Requires operation identity, call arguments, counts, and source locations. |
| Analyze component-local extraction seams | Partial/proxy | Existing reports and route metrics expose general complexity; the topology shows transforms by component. | There is no dedicated model of reactive blocks, local dependency regions, DOM ownership, or proposed component seams. |
| Prove same runtime instance across calls | Absent | Existing route planning defines source identity by concrete persistence method, not returned runtime instance. | Static type or method equality must not be promoted to instance equality. |

## Tensions, assumptions, and non-goals

### Healthy context versus over-centralized context

The memo explicitly treats direct context reads as potentially healthy. The
problem is repeated or misplaced work after the read, not broad access by
itself. A consumer count must therefore remain descriptive rather than a smell.

### Compute once versus preserve local ownership

Moving `extractBorders(page)` into context could remove repetition, but it also
widens the context contract. Alternatives include a shared pure helper, a
feature selector, memoization at an intermediate owner, or leaving a cheap
operation local. The tool should show evidence and affected consumers before
recommending ownership.

### Static equality versus runtime identity

Matching types, getters, or operation names cannot establish that two calls
refer to the same entity. Arguments and resolved symbols strengthen static
evidence; runtime identity remains a separate capability.

### Investigation versus automatic refactoring

The first context-departure view should answer “what happens?” A later detector
may answer “what should change?” only after the product defines repeated-work
invariants and disproof conditions.

### Non-goals for the next slice

- no runtime instrumentation;
- no automatic context redesign;
- no arbitrary all-scope tree;
- no claim that every repeated helper call is waste;
- no new jumbo-component visualization;
- no replacement of the current source-to-sink topology;
- no hiding meaningful field extraction, fallback, normalization, or opaque
  work inside a collapsed UI boundary.

## Opportunity backlog

### Near-term

- field selection on a chosen source;
- context-departure projection and repeated-operation grouping;
- truthful counts, locations, and unknowns for each group;
- explainable terminal-family collapse;
- continuation from an intermediate derived value.

### Exploratory

- nested-field and collection-element selection;
- compare several fields from one context side by side;
- recommendation engine for compute-once versus local derivation;
- direct component-breakdown report with reactive-block/DOM seams;
- runtime overlay for call arguments and entity instances.

### Parked or cautioned

- a universal scope-container graph;
- fixed-depth truncation as the primary reduction strategy;
- treating `components/ui` as sufficient proof of terminal behavior;
- equating source type identity with business-object identity.

## Product questions

### Q01 — What is the first selection unit?

Options:

1. **Top-level source field:** smallest extension of current evidence and the
   recommended lean.
2. Nested property path: more expressive, but immediately introduces aliasing,
   optionality, collection elements, and computed keys.
3. Derived value: useful for continuation, but needs stable operation/value
   identity first.

**Recommended lean:** Start with one top-level field, then let proven operations
produce selectable derived values.

### Q02 — Is context departure a new mode or a refinement of topology?

Options:

1. **Refinement inside topology:** preserves route and source orientation while
   changing the selected origin.
2. Dedicated mode: gives the sequence more space but adds another product
   surface and navigation state.

**Recommended lean:** Prototype it as a refinement reached from a context node
or field. Promote it to a dedicated mode only if the operation groups no longer
fit the topology workspace.

### Q03 — What counts as the same repeated operation?

Options:

1. Same source field plus resolved function symbol.
2. Same field, function symbol, and statically equivalent arguments.
3. Same output shape regardless of implementation.

**Recommended lean:** Use option 2 when arguments are statically comparable;
fall back to option 1 with lower confidence. Output-shape similarity alone is
only a search clue.

### Q04 — Where should a context-outward path stop?

Options:

1. First reusable display boundary.
2. First render sink.
3. User-controlled expansion from a collapsed display boundary.

**Recommended lean:** Use option 3: summarize at a conservative reusable
boundary, keep the final extraction visible, and allow expansion.

### Q05 — Should repeated work immediately become a finding?

Options:

1. Yes, rank by repeated count.
2. **No, ship evidence first:** require the user to inspect cost, arguments, and
   ownership.
3. Only flag repeated operations known to be expensive.

**Recommended lean:** Option 2. Count is not proof of waste.

### Q06 — How should broad-context direct renders appear?

Options:

1. Render every direct path.
2. Hide all direct paths.
3. **Summarize them as a healthy/ordinary group** with a truthful count and
   reveal control.

**Recommended lean:** Option 3, without calling them healthy unless the system
has checked that no meaningful transform is hidden.

### Q07 — Is component breakdown part of this delivery?

Options:

1. Combine it with context departure.
2. **Keep it as a separate work stream** sharing evidence primitives later.

**Recommended lean:** Option 2. It has a different starting point, user job, and
acceptance test.

### Q08 — When is runtime evidence worth adding?

Options:

1. Add instrumentation now to prove object identity.
2. **Keep the static view honest and defer runtime evidence** until duplicate
   source calls are a validated high-value problem.

**Recommended lean:** Option 2.

## Recommended next slice

### Field-refined context departure for the Pluck capture route

Prove J01 and J02 without attempting automatic refactoring.

#### User flow

1. Open the existing route topology for the Pluck capture route.
2. Select the broad capture/page source.
3. Select one proven top-level field.
4. See only components and trajectories with proven participation for that
   field.
5. Select the context node and open **Departures**.
6. See grouped first operations:

   ```text
   page.borders
     -> extractBorders(page) · 12 call sites · 8 components
     -> direct render · 4 terminals
     -> prop handoff · 3 child components
     -> unknown/opaque · 1 site
   ```

7. Inspect a group for exact locations, arguments, destinations, and
   completeness.
8. Continue from one derived value or reveal its terminal subtree.

#### Required capabilities

- field key in URL/restorable exploration state;
- field-specific projection over already-proven source trajectories;
- context-read identification;
- first-meaningful-operation classification;
- resolved operation identity and statically visible arguments;
- aggregation with retained call sites and destination components;
- unknown/opaque bucket;
- conservative display-boundary collapse.

#### Acceptance criteria

- selecting a field visibly reduces a route where the source selection alone
  lights almost every component;
- no component is included from field-name coincidence without a proven
  source-rooted trajectory;
- repeated operations show truthful counts and source locations;
- direct render, prop handoff, transform, and unknown departures remain
  distinguishable;
- a user can determine whether repeated derivation exists without inspecting
  all source-to-sink paths;
- the view never claims two calls return the same runtime object;
- clearing the field returns to the unchanged source-level topology.

#### Decision gate

After testing on the Pluck capture route:

- if field selection alone restores useful discrimination, keep context
  departure as inspector detail;
- if repeated operations are the primary insight, promote Departures to a
  dedicated view;
- if the strongest problems are entirely component-local, prioritize the
  separate component-breakdown work stream next.

## Coverage check

Every major passage in the memo maps to this document:

- 00:00:17–00:06:03 → J01 and adaptive analytical grain;
- 00:06:04–00:12:33 → J02/J03 and the distinction between healthy context use
  and repeated transformation;
- 00:12:33–00:18:11 → semantic boundaries plus investigation-versus-diagnosis;
- 00:18:11–00:23:42 → context departure and repeated derivation;
- 00:23:42–00:26:25 → duplicate sources, static/runtime identity, and the
  dedicated context-usage possibility;
- 00:26:25–00:28:08 → granular paths versus unhelpful scope containers;
- 00:28:08–00:32:22 → J05 component breakdown;
- 00:33:06–00:34:49 → terminal heuristics, graph reduction, and the parked
  depth-limit fallback.
