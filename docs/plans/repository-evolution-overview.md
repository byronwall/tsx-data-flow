# Repository Evolution Overview

## Direction

`tsx-dataflow` should evolve from a collection of render-path reports into a
whole-repository, symbol- and expression-centered data-flow workspace. Its
primary use is making sense of unfamiliar, often agent-written applications.
Change review is an important later lens over that model, not the default entry
point.

Its durable advantage is not generic architecture visualization or another lint
catalog. It is the ability to combine TypeScript's semantic model with concrete
source-to-render paths and answer:

> What enters this application, how does it become what the user sees, where
> does needless complexity enter that flow, and where should I act?

The transcript reinforces the current product intent in three useful ways:

1. **Intermediate representations are the review target.** The interesting smell
   is often not a function call but the value becoming an object, scalar, string,
   list, or different object several times on the way to output.
2. **Whole-system diagrams are orientation tools, not the working surface.** A
   giant graph quickly becomes unreadable. Start from a changed file, expression,
   symbol, component, or sink and reveal only its meaningful trajectory.
3. **Visual evidence should separate real edge cases from invented ones.** Types,
   source locations, before/after shapes, and downstream reach should support the
   recommendation. The tool should show uncertainty instead of compensating with
   generic advice.

## Current foundation

The repository already has most of the architectural pieces needed:

- project discovery and multi-tsconfig TypeScript programs;
- typed sink-to-source tracing with optional cross-file helper traversal;
- graph nodes/edges, defenses, representation steps, packs, fan-in/out, relays,
  repeated forks, junctions, and component references;
- burden ranking, scoped files, work units, baselines, and comparisons;
- strict API DTOs and a Solid code-map workspace;
- Markdown reports intended for human-to-agent handoff.

The main gaps are semantic and product-level rather than infrastructural:

- types are displayed but type/shape changes are not modeled;
- symbols are only first-class in limited slices such as component references;
- comparison does not yet attribute consequences to changed code robustly;
- report families still compete with the unified explorer model;
- recommendations can outrun evidence when a transformation may be legitimate;
- architectural orientation exists as file/report summaries, not a focused map of
  feature/data trajectories.

## Reference repositories and validation matrix

Development should use four real, agent-heavy repositories as the product test
set. Synthetic fixtures remain useful for unit precision, but a roadmap milestone
does not count as product-complete until it improves orientation or cleanup work
in these applications.

### HN Offline (`/Users/byronwall/Projects/hn-client`)

This is the compact control case: roughly 5,900 lines of TypeScript/TSX and 39
TSX files. It is smaller than the target project range, which makes it useful for
checking whether the map tells a coherent end-to-end story without scale being
the excuse.

Representative trajectories:

- server Hacker News queries into application data;
- `AppDataContext` and the data/read/refresh stores into story and comment TSX;
- persisted/offline state through LocalForage and service-worker status;
- optional or temporarily unavailable async data becoming render fallbacks.

Use it to validate source/terminal classification, context landmarks, resource
certainty, repeated normalization, and whether the world view is understandable
without prior repository knowledge.

### Pluck (`/Users/byronwall/Projects/pluck-ui`)

This is the scale and transformation stress case: roughly 98,000 lines of
TypeScript/TSX and 275 TSX files. Its capture pipeline loads persisted JSON and
DOM/CSS snapshots, validates schemas, merges fragment data, normalizes captured
frames, derives annotations/inventories, and eventually renders several complex
inspection surfaces.

Representative trajectories:

- captured page/DOM/CSS assets into `CaptureDetail`;
- fragments, nodes, sections, fonts, and snapshots through normalization and
  reconciliation into capture viewers;
- capture annotations through classification, scoring, inventory models, and
  board layout;
- account/project/board persistence into route and context-owned UI state;
- extension capture data crossing into the SolidStart application.

Use it to validate performance at the top of the expected range, grouping and
collapsing of large areas, file/JSON boundaries, opaque data, dropped/recovered
fields, derivative shapes, and common-root blast radius.

### Logo Dodo (`/Users/byronwall/Projects/ai-icon-kit`)

This is a mid-sized domain-model and workflow case: roughly 43,000 lines of
TypeScript/TSX and 128 TSX files. Its `Project -> Board -> Candidate` model passes
through storage, generation, segmentation, refinement, route DTOs, and large
interactive workbench components.

Representative trajectories:

- `Project`, `Board`, and `Candidate` from file storage and API routes into the
  project workbench;
- prompt inputs and refinement settings into AI generation requests and progress
  state;
- candidate image bounds through segmentation/reference forms into previews and
  editing UI;
- project summaries/settings/feedback DTOs into overlapping derived view models.

Use it to validate important-type selection, field provenance, near-copy
derivative types, dropped/recovered candidate fields, status normalization, and
whether one upstream cause can explain many workbench sinks.

### Visual Notes (`/Users/byronwall/Projects/visual-notes`)

This is a mid-to-large persistence, editor, and mathematical-transformation case:
roughly 67,000 lines of TypeScript/TSX. It combines Prisma persistence,
Markdown/HTML conversion, TipTap/ProseMirror editor state, embeddings, UMAP
projections, archive data, and several very large interactive UI surfaces.

Representative trajectories:

- database documents through Markdown/HTML normalization into editor and viewer
  TSX;
- editor structures back through serialization and database writes;
- document text through chunking, embeddings, vector storage, UMAP projection,
  regions, and canvas rendering;
- archive/task/time-block records through service models into large workspaces;
- canvas positions and selections through stores into visual rendering.

Use it to validate server/database boundaries, typed-to-opaque-to-typed paths,
collection aggregation, mathematical transformations, write sinks, and the
difference between legitimate transformation pipelines and needless shape churn.

### Cross-repository product gates

Use the repositories as a progression, not four equivalent test suites:

1. **HN Offline:** prove the basic world map and one complete type/value
   trajectory are understandable.
2. **Logo Dodo:** prove field provenance and root-cause grouping on a recognizable
   domain model.
3. **Visual Notes:** prove the analyzer can explain long legitimate pipelines
   without classifying every transformation as cleanup work.
4. **Pluck:** prove grouping, trace coverage, and interaction remain useful near
   100,000 lines.

For every major milestone, save a small review record for each applicable repo:

- the selected trajectory and why it matters;
- the top three cleanup opportunities;
- proven, suspicious, and incomplete evidence counts;
- one false-positive or missing-path audit;
- analysis time and focused-view interaction quality;
- whether an applied cleanup remains improved after reanalysis.

## Primary journeys

The product needs two complementary ways into one underlying graph.

### Understand the system

The default whole-project view is a zoomed-out world map:

- sources and application entry points on the left;
- terminal sinks on the right, initially emphasizing TSX/JSX render output;
- SolidStart server-to-client boundaries and context-owned data as prominent
  intermediate landmarks;
- files/components grouped into readable areas rather than rendered as every
  individual syntax node;
- color or burden overlays for transformation count, defenses, opacity, and
  significant findings.

Selecting an area narrows the map to a few files. Selecting a named type, value,
or endpoint shows its full trajectory through transformations to its terminal
sinks. This is the primary orientation workflow.

### Find cleanup work

A ranked list provides the burn-down workflow. It should group paths that share
an upstream cause into one cleanup opportunity and show the total blast radius.
The top result is not necessarily one sink; it is the highest-leverage common
cause supported by the graph.

These are not separate report systems. Map selections, cleanup opportunities,
type trajectories, and code-map evidence are projections of the same identities
and paths.

## Recommended sequence

### Horizon 1: Make existing evidence coherent

Finish the product shape already committed in `INTENT.md` before adding many new
detectors.

- Complete symbol-accurate “where used” and jump-to-definition for participating
  expressions, then make tokens in the code map selectable.
- Attach findings, usages, transformations, relays, and graph facts to the same
  expression/symbol identity within an analysis generation.
- Finish absorbing useful report rows into the typed unified inventory; retire or
  demote report pages that do not earn a distinct holistic viewer.
- Standardize finding evidence: responsible expression, path, locations, why it
  matters, confidence/disproof condition, and concise next action.
- Keep ordinary usage and low-significance transformations browsable but outside
  the problem count.

Why first: the next analyses need a stable way to select an expression and show
several facts about it without creating more standalone reports.

### Horizon 2: Ship one whole-project world-view slice

Build the first end-to-end orientation experience before broadening the detector
catalog:

- TSX/JSX sinks on the right;
- their traced sources on the left;
- SolidStart server/client boundaries and context values called out;
- grouping by file/component area;
- selection of one important type/value trajectory;
- color overlays derived from existing defenses, relays, forks, unknowns, and
  representation metrics;
- a linked ranked list of common-root cleanup opportunities.

The map may initially omit flows the analyzer cannot trace. It must summarize
coverage and opacity rather than imply that the picture is complete.

Why now: a human needs to see the repository's shape before the product can
validate whether more detailed transformation semantics improve orientation.

Validate first on HN Offline, then require the same interaction to remain legible
on Logo Dodo and Pluck. The first named trajectory should be HN server/store data
through `AppDataContext` into story/comment TSX. The scale gate is selecting one
Pluck capture area without rendering the entire capture graph.

### Horizon 3: Add type-shape transformation tracing

Implement [type-shape-transformation-tracing.md](type-shape-transformation-tracing.md).

This adds the missing semantic layer over today's operation graph: projection,
packing, narrowing, filtering, selection, aggregation, loss, restoration, and
opaque boundaries. Begin with a sink-selected ledger and a few high-confidence
smells, especially object-to-ID-to-same-object and drop-then-recover paths.

This should become the preferred evidence behind representation-churn findings.
Raw alias/object-pack counts remain useful metrics but should no longer carry the
recommendation alone.

Prioritize dropped-then-recovered fields and repeated normalization. Add
representation flip-flops after those produce reliable evidence. Aggregate
several affected sinks under the shared upstream cause rather than emitting one
cleanup row per sink.

Use Logo Dodo's `Project -> Board -> Candidate` flow as the primary field-
provenance case, HN resources/stores as the introduced-uncertainty case, Pluck's
capture detail/inventory pipeline as the dropped/recovered stress case, and
Visual Notes embeddings/UMAP plus Markdown/editor pipelines as the false-positive
control for legitimate transformations.

### Horizon 4: Add change review as a strict delta lens

Implement [change-oriented-analysis-review.md](change-oriented-analysis-review.md).

Treat an explicit changed-file/line manifest as the core input and Git as a
convenience adapter. Compare semantic facts and attribute downstream consequences
to changed expressions. Lead the overview with introduced/worsened complexity.
Keep known pre-existing problems in ordinary whole-project exploration rather
than repeating them in change-review mode.

Only clear new or worsened problems belong in the main delta. Ambiguous matches
belong in a separate “possibly related” section; known pre-existing problems do
not belong in change-review results.

### Horizon 5: Expand terminal sinks and architecture slices

After the TSX-centered world view proves useful, expand the same graph rather
than creating a separate architecture analyzer. The next terminal sink families
are database writes, filesystem writes, and typed backend-to-backend boundaries.

Visual Notes supplies the first database-write and serialized-editor cases;
Pluck and Logo Dodo supply file/JSON write cases. The bidirectional map should be
able to trace both toward TSX and back toward these persistence sinks.

Useful scopes:

- one component and its upstream inputs/downstream consumers;
- one named type/entity through API, state, helpers, and JSX;
- one changed symbol's vertical path and cross-cutting support dependencies;
- one opaque boundary with everything entering and leaving it.

Group by file/component and collapse ordinary pass-through hops. Color by stable
semantic categories such as input, normalization, derivation, state, boundary,
and render—not by arbitrary graph node kinds. The overview should point to a
focused slice; it should never default to rendering every node and edge.

Feature-name inference from folder names can be a filter hint, but not ground
truth. Explicit scopes and checker symbols are safer anchors.

### Horizon 6: Optional runtime evidence

Static analysis can identify an invented edge case only up to the type and source
evidence available. A later, explicitly optional layer could ingest runtime
snapshots or traces to confirm which unions, fallbacks, branches, and intermediate
shapes actually occur.

Keep this separate from the static analyzer:

- static findings remain usable without instrumentation;
- runtime evidence annotates a static path rather than replacing it;
- absence of an observed case is not proof that it is impossible;
- no general application debugger or DOM-capture system is required.

This horizon should wait until static transformation and change review workflows
prove their value.

## Product surface after these horizons

The overview is the zoomed-out data-flow world map plus its ranked cleanup list.
The focused workspace remains source on the left and explorer on the right.

The overview answers whether the selected change/scope has a problem. The code
map answers where and why. The right panel has a single typed inventory with
lenses for:

- significant findings;
- transformations;
- important type/value trajectories;
- references/usages;
- boundaries and connectivity;
- change regressions when a comparison is active;
- background facts.

Selecting any entry overlays the same source and renders one heavy detail at a
time. The web interface is the primary product until the analyses earn trust.
Markdown is a terse breadcrumb trail for an agent to investigate or implement a
human-approved cleanup; it does not need to reproduce the exploratory UI. JSON
supports the UI and automation but is not treated as a permanent public schema.

Most standalone report tabs should disappear as their useful facts move into the
map, cleanup list, and focused explorer. CLI views may remain as agent-oriented
projections when they have a concrete consumer. Aggregate comparison views have
no preservation promise.

## Analysis principles

### Facts before findings

Record operations, types, shapes, identities, locations, and reach first. A
finding is a thresholded interpretation of those facts. Users must be able to
inspect sub-threshold facts without having them presented as defects.

### Prove identity through the checker

Never group sources by text when symbol identity is available. When identity is
lost at an opaque boundary, say so. Generation-local IDs are sufficient.

### Attribute uncertainty

Every semantic claim should be proven, inferred, or unknown. Unknown edges are a
review queue, not evidence that the code is bad.

The user-facing levels are:

- **Proven unnecessary** — sufficiently grounded to hand directly to an agent;
- **Suspicious transformation** — visible evidence for a competent developer to
  inspect, without a prescribed fix;
- **Trace incomplete** — a coverage limitation that may explain why an expected
  problem is not visible.

### Prefer local trajectories over universal graphs

The graph is an internal model. The product view is a carefully scoped
trajectory: selected input to output, selected sink to sources, selected change
to consequences, or selected type through transformations.

### Recommend against contracts, not syntax taste

“There are three object packs” is evidence, not a fix. Strong recommendations
should explain what information is lost/recovered, which defense cannot fire,
which responsibility crosses a boundary, or which changed expression creates
downstream cost.

### Keep performance proportional to scope

Use project-wide TypeScript context for correctness, but compute and serialize
detailed paths for participating or changed scopes. Optimize measured bottlenecks
and keep the 1–5 second scoped target visible in every phase.

## What should not become core roadmap work

The transcript contains adjacent ideas that are valuable but belong elsewhere:

- agent chat-log introspection, token/turn analysis, restart advice, and skill
  generation are a separate agent-run analysis product;
- interactive UI behavior traces, viewport snapshots, and visual regression
  fingerprints belong in runtime/dev tooling;
- pre-visualizing an architecture before code exists cannot be grounded in this
  analyzer's TypeScript evidence;
- generic repository maps are less aligned than render/data trajectories and
  change review.

The repo may eventually consume outputs from those tools, but expanding into
them now would weaken its specific advantage.

## Roadmap checkpoints

Before advancing between horizons, evaluate against concrete review sessions:

- Can a reviewer understand the trajectory of one important type/value from the
  world view into its focused code path?
- Can the tool identify three high-leverage cleanup opportunities grouped by
  common upstream cause and blast radius?
- Can a reviewer find the responsible changed expression in under one minute?
- Did the top recommendation remain correct after the suggested edit, or did the
  analyzer immediately recommend reversing it?
- Are high-ranked items supported by stronger evidence than path length/counts?
- Does each new detector add signal without crowding out other finding families?
- Does the Markdown give an agent enough evidence to act without dumping the
  entire report?
- Does scoped performance remain within target on 10k, 50k, and representative
  100k+ line projects?

If a detector repeatedly needs product context the analyzer cannot know, keep it
as a browsable fact or investigation prompt rather than escalating its score.

An especially important stability check is recommendation consistency: after an
agent applies a suggested cleanup, the analyzer must not immediately penalize the
result for the mechanically opposite representation choice. A detector that
cannot distinguish those cases is evidence-only until corrected.
