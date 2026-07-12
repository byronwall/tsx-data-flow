# Overall Execution Plan: Whole-Repository Data-Flow Explorer

## Purpose

This plan turns `tsx-dataflow` into a human-first, whole-repository data-flow
workspace for understanding unfamiliar, agent-written TypeScript applications.
It is organized so an implementation agent can execute and validate one phase at
a time without silently expanding into later phases.

The primary product question is:

> What enters this application, how does it become what the user sees, where
> does unnecessary complexity enter that flow, and where should I clean it up?

The default workflow is whole-project exploration. Change review and unattended
agent cleanup come later, after the underlying analysis earns trust through human
review.

## Source plans

Read these before implementing any phase:

- [`INTENT.md`](../../INTENT.md)
- [`repository-evolution-overview.md`](repository-evolution-overview.md)
- [`type-shape-transformation-tracing.md`](type-shape-transformation-tracing.md)
- [`change-oriented-analysis-review.md`](change-oriented-analysis-review.md)
- [`../application-structure.md`](../application-structure.md)
- [`../design-preferences.md`](../design-preferences.md) before frontend work

When this execution plan conflicts with a more detailed source plan, preserve the
product decisions here and use the detailed plan for implementation mechanics.

## Product decisions that govern every phase

- The web interface is the primary product. Markdown and CLI views are agent
  breadcrumbs, not equal human-facing surfaces.
- The first terminal sinks are TSX/JSX outputs. SolidStart server/client
  boundaries and context-owned values are important landmarks.
- The eventual graph may also terminate at database writes, filesystem writes,
  and typed backend-to-backend boundaries.
- The overview needs two ways into the same graph:
  - a zoomed-out source-to-terminal world map for orientation;
  - a ranked cleanup list for issue burn-down.
- Several affected sinks sharing one upstream cause form one cleanup opportunity
  with a blast radius, not many competing findings.
- User-facing evidence has three levels:
  - **Proven unnecessary** — safe to hand directly to an agent;
  - **Suspicious transformation** — evidence for developer judgment, without a
    prescribed contract change;
  - **Trace incomplete** — the analyzer cannot reach a useful conclusion.
- Facts remain browsable below the finding threshold.
- A cleanup recommendation is not trusted if applying it causes the analyzer to
  complain about the mechanically opposite representation choice.
- Generation-local identities are sufficient. Durable cross-run graph IDs are
  not a product requirement.

## Reference repositories

Use these real repositories as the product evaluation ladder. Inspections and
analysis runs against them are read-only unless the user separately authorizes a
cleanup in that repository.

| Repository | Role | Representative flow |
| --- | --- | --- |
| HN Offline (`/Users/byronwall/Projects/hn-client`) | Compact end-to-end control | Server queries and offline stores through `AppDataContext` into story/comment TSX |
| Logo Dodo (`/Users/byronwall/Projects/ai-icon-kit`) | Domain-model and field-provenance case | `Project -> Board -> Candidate` through storage, API routes, generation, segmentation, and workbench UI |
| Visual Notes (`/Users/byronwall/Projects/visual-notes`) | Legitimate-transformation and persistence control | Database documents through Markdown/HTML/editor paths; text through embeddings and UMAP into canvas TSX |
| Pluck (`/Users/byronwall/Projects/pluck-ui`) | Near-100k-line scale and transformation stress case | Capture JSON/DOM/CSS through schemas, fragments, normalization, annotations, inventory, layout, and viewers |

Do not require all four repositories for every low-level unit change. Each phase
names its required real-repository gates.

## Phase execution contract

For each phase, the implementing agent must:

1. Read this plan, the relevant source plan, repository guidance, and the current
   implementation before editing.
2. Record a short implementation checklist scoped to the current phase only.
3. Add analyzer-domain behavior before DTO and UI projections when the phase
   crosses those boundaries.
4. Add focused unit/integration tests for new semantics and negative cases.
5. Run the repository verification suite:

   ```sh
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

6. Run the phase's named real-repository evaluation cases and record results in a
   small Markdown evaluation note under `docs/evaluations/`.
7. Stop at the phase exit gate. Do not begin the next phase merely because nearby
   infrastructure is convenient to add.

Each evaluation note should capture:

- repository and analyzer command/settings;
- selected trajectory and why it matters;
- top cleanup opportunities, if the phase produces them;
- proven, suspicious, and incomplete evidence;
- one false-positive or missing-path audit;
- analysis time and any interaction-performance observation;
- whether the phase exit gate passed.

## Current implementation status (reconciled 2026-07-11)

- **Phase 1 is complete.** The implementation and post-gate review now cover
  checker-backed project-local identity, canonical imported definitions,
  independently selectable traced expressions, general project-local symbol
  references outside TSX traces, symbol and type-definition navigation, usages,
  terminal reach, attached findings, trace completeness, and compact copied
  evidence. Ambient/platform declarations remain deliberately outside the
  selectable project identity model.
- The Phase 1 real-repository gates passed for HN Offline and Logo Dodo. The
  subsequent Pluck review also corrected symbol-based local/parameter tracing,
  same-file helper argument binding, and redundant per-file analysis after the
  workspace report is cached. These are Phase 1 correctness and performance
  hardening, not early completion of transformation analysis.
- **Phase 0 is complete as a current-state baseline.** The original pre-Phase-1
  baseline cannot be reconstructed, so the historical Phase 1 notes are retained
  alongside a checked-in four-repository manifest and post-Phase-1 measurements.
- **Phase 2 is complete.** The overview now projects a bounded whole-project map,
  aggregated inter-area connections, representative trajectories, and a linked
  shared-cause cleanup queue from the cached workspace report. Area, value/type,
  trajectory, and source drill-down reuse Phase 1 identity/navigation. HN
  Offline, Logo Dodo, and Pluck gates passed with recorded scale measurements.
- **Phase 2 orientation hardening is required before Phase 3.** Human review found
  that a file-level source-to-terminal network does not reveal Solid component
  composition: route shells, intermediate composers, terminal renderers, and
  broadly reused UI components are indistinguishable. The world map must expose
  the checker-backed JSX parent-to-child hierarchy as its default orientation
  lens while retaining the value-flow network as a separate trajectory lens.
  Selection must isolate a component's direct family so shared primitives do not
  leave every high-volume edge visible at once. This is Phase 2 scope, not a
  dependency on normalized shapes or field provenance.
- **Phase 3 is next.** Resolving and navigating to a named TypeScript type
  declaration is identity evidence; it is not a normalized `ValueShape`, a
  `TransformationStep`, field provenance, or before/after shape analysis.

## Phase 0: Baseline the real repositories

### Objective

Create a repeatable product baseline before adding new analysis infrastructure.
The baseline should make later improvements and regressions visible.

### Work

- Add a checked-in evaluation manifest that identifies each reference repository,
  source root, tsconfig, and a few human-readable target trajectories.
- Do not use durable analyzer node IDs in the manifest. Use files, symbols,
  components, routes, or type names that a human can relocate.
- Run the current analyzer against all four repositories.
- Record current analysis time, unknown-edge coverage, highest-ranked findings,
  and whether the current UI can locate each target trajectory.
- Identify one known legitimate path and one suspected unnecessary-complexity path
  in each repository for later regression testing.

### Required repository gates

- HN Offline: server/store/context to story or comment rendering.
- Logo Dodo: `Project`, `Board`, or `Candidate` into project workbench TSX.
- Visual Notes: document Markdown/HTML/editor path or embeddings-to-UMAP path.
- Pluck: captured page/detail into an inventory or viewer surface.

### Exit gate

- The four repositories can be analyzed reproducibly.
- Baseline notes identify coverage gaps without claiming the current report is
  complete.
- Later phases have stable, human-readable evaluation targets.

## Phase 1: Unify symbol identity and expression evidence

### Objective

Create one generation-local identity and evidence model that later maps,
transformations, findings, usages, and comparisons can share.

### Work

- Introduce checker-backed generation-local identities for participating symbols,
  expressions, types, boundaries, and terminal sinks.
- Complete symbol-accurate where-used and jump-to-definition for participating
  expressions.
- Standardize evidence attached to an expression:
  - definition and use locations;
  - upstream and downstream paths;
  - terminal sinks and total reach;
  - defenses, existing representation steps, and unknown boundaries;
  - trace-completeness reason;
  - evidence level.
- Attach existing findings and graph facts to the shared identity model.
- Extend strict API schemas and projections without importing analyzer-domain
  types into the frontend.
- Make participating source expressions selectable in the code map, while keeping
  initial SSR DOM structure deterministic.

### Tests

- same-name/different-symbol separation;
- aliased import identity;
- local and traced cross-file definitions/usages;
- unresolved/external symbols producing trace-incomplete evidence;
- schema rejection for malformed identity/evidence DTOs;
- code-map selection and source navigation.

### Required repository gates

- HN Offline: distinguish context/store values with similar property names and
  navigate from a rendered story/comment value to its definition and uses.
- Logo Dodo: navigate a `Project`, `Board`, or `Candidate` field across at least
  two files without name-based false grouping.

### Exit gate

Selecting a participating expression reliably reveals its definition, usages,
attached findings, terminal reach, and trace completeness without leaving the
code-map workspace.

## Phase 2: Ship the first whole-project world map

### Objective

Deliver the primary orientation workflow using the evidence already available,
before waiting for the full transformation model.

### Work

- Begin with a short baseline preflight:
  - add the Phase 0 evaluation manifest if it is still missing;
  - record current-state runs for all four reference repositories;
  - treat the existing HN Offline and Logo Dodo Phase 1 notes as historical
    comparisons, and add the missing Visual Notes and Pluck baseline notes before
    the Phase 2 exit gate.
- Add a whole-project semantic map with:
  - traced sources and entry points toward the left;
  - TSX/JSX terminal sinks toward the right;
  - SolidStart server/client boundaries and context values as landmarks;
  - files/components collapsed into readable areas;
  - visible incomplete/opaque boundaries;
  - overlays from existing defenses, relays, repeated forks, unknowns, fan-out,
    and representation metrics.
- Provide two explicit projections of the same repository model:
  - component structure, showing checker-resolved JSX parent-to-child calls and
    distinguishing roots/route shells, composers, terminal renderers, and shared
    components;
  - traced data flow, showing source/value trajectories toward TSX terminals.
  Keep common components bounded by default and reveal their full direct family
  on selection instead of drawing every shared-primitive edge persistently.
- Use progressive selection:

  ```text
  whole repository -> area -> value/type -> trajectory -> source evidence
  ```

- Add a linked ranked cleanup list based on current findings.
- Group rows that already share a provable upstream cause and show sink/file
  blast radius.
- Reuse the generation-local identity index and cached workspace report for map
  selection. Do not launch a file-specific retrace when drilling into source.
- Carry one selection model from map area/value/type/trajectory into the existing
  source workspace. Preserve symbol-definition and type-definition links and the
  distinction between selecting an entity and explicitly jumping to a line.
- Keep the existing project-ownership rule: ambient/platform/library declarations
  may appear as opaque operations or landmarks where relevant, but must not
  become map areas or high-volume project usage groups.
- Keep one heavy map/detail selection rendered at a time.
- Preserve the source-left/explorer-right focused workspace after drill-down.

### Performance constraints

- Avoid sending or rendering every graph node merely because the analyzer has it.
- Group before serialization where practical.
- Selection and drill-down must feel immediate after initial data load.
- Record cold analysis, DTO size, parse time, and initial render time separately.
- Use the measured Pluck behavior as an initial regression marker: cold workspace
  analysis was about 19.3 seconds before Phase 2 work, and the removed redundant
  file retrace cost about 7.5 seconds. Re-measure rather than treating these
  machine-specific numbers as budgets.

### Required repository gates

- HN Offline: the entire application map is understandable without prior code
  knowledge; trace one server/store value through `AppDataContext` into TSX.
- Logo Dodo: select the logo-workbench area and isolate a project/board/candidate
  trajectory without unrelated routes dominating it.
- Pluck: select one capture/inventory area without rendering the entire capture
  graph or freezing the browser.

### Exit gate

A reviewer can open an unfamiliar repository, understand its broad source-to-TSX
shape, select one important trajectory, and reach responsible source within one
minute. The current-state four-repository baseline is recorded, map drill-down
does not trigger redundant file analysis, and source navigation retains the
Phase 1 identity/type-definition behavior.

## Phase 3: Add normalized type shapes and field provenance

### Objective

Model how data changes along existing paths so the product can explain needless
derivative types instead of relying on syntax-step counts.

### Work

- Implement normalized `ValueShape` and `TransformationStep` analyzer-domain
  models described in `type-shape-transformation-tracing.md`.
- Support primitives, literals, named objects, unions, nullish membership, arrays,
  readonly arrays, tuples, generics/type parameters, `any`, `unknown`, and opaque
  types.
- Keep object expansion shallow and deterministic.
- Record before/after shapes for high-confidence operations:
  - property projection;
  - object packing, picking, spreading, and renaming;
  - filtering, selection, mapping, and aggregation;
  - fallback/optional normalization;
  - parsing and serialization;
  - unresolved calls as opaque, not guessed.
- Record field provenance when an output field can be tied to an upstream
  symbol/property.
- Show transformations as a focused ledger attached to a selected trajectory.
- Feed transformation counts and opacity into the world-map overlays without yet
  turning every pattern into a finding.

### Tests

- normalized shape stability;
- recursive types without runaway expansion;
- exact and partial field provenance;
- renamed fields and object spreads;
- collection operation classification;
- custom/ambiguous calls remaining unknown;
- cross-file helper parameter binding;
- DTO caps whose displayed totals remain truthful.

### Required repository gates

- Logo Dodo: show how `Project`, `Board`, and `Candidate` fields pass through one
  storage/API/workbench trajectory, including field provenance.
- Visual Notes: render a Markdown/HTML/editor or embeddings/UMAP trajectory as
  legitimate transformations without automatically labeling it defective.
- Pluck: obtain a bounded transformation ledger for one capture-detail or
  inventory path without graph explosion.

### Exit gate

For a selected important value, the reviewer can see before/after shapes, field
origins, information loss, restoration, and opacity at source-linked steps.

## Phase 4: Detect dropped/recovered data and repeated normalization

### Objective

Turn the highest-value transformation sequences into reliable cleanup evidence.

### Work packet A: Dropped then recovered fields

- Detect fields removed from an upstream object and later restored by lookup,
  merge, or reconstruction.
- Treat object-to-key-to-same-object as a high-confidence subtype.
- Detect derivative shapes where most fields come unchanged from one upstream
  object and only a small minority differ.
- Show exact field provenance, loss/restoration points, and downstream consumers.

### Work packet B: Repeated normalization and introduced uncertainty

- Detect the same lineage defaulted or optionally read more than once.
- Detect a previously certain value becoming optional at resource, async,
  wrapper, or derivative boundaries.
- Detect inconsistent defaults applied to the same lineage.
- Reuse the current type-impossible defense classification for proven cases.

### Ranking and presentation

- Group affected paths by common upstream cause.
- Rank one cleanup opportunity using total reach, evidence strength, and opacity;
  do not produce one top-level row per sink.
- Use direct fix/removal language only for proven-unnecessary evidence.
- Suspicious entries show the path and why it deserves review, not a generic fix.
- Trace-incomplete entries explain the missing boundary.

### Consistency evaluation

For at least one proven and one suspicious example:

1. save the before report;
2. apply a candidate cleanup in a disposable worktree or fixture;
3. reanalyze;
4. verify that the original burden improves;
5. verify that the new representation is not penalized merely for being the
   opposite packing/unpacking choice.

Do not modify a reference repository without separate user authorization. A
synthetic or copied fixture is acceptable for the edit/reanalysis step.

### Required repository gates

- Logo Dodo: primary field-provenance and near-copy derivative-type evaluation.
- HN Offline: primary resource/async introduced-uncertainty evaluation.
- Pluck: primary dropped/recovered-field and shared-root blast-radius stress case.
- Visual Notes: false-positive control for deliberate Markdown/editor and
  embeddings/UMAP normalization.

### Exit gate

The top detector results are useful cleanup requests, proven findings are safe to
hand to an agent, suspicious findings remain evidence-only, and cleanup
reanalysis is directionally stable.

## Phase 5: Add representation flip-flops and root-cause work units

### Objective

Broaden transformation analysis only after the first detectors demonstrate
precision and recommendation stability.

### Work

- Detect repeated transitions between equivalent or near-equivalent shapes.
- Distinguish representation-only changes from semantic derivation.
- Avoid treating matching before/after shapes as proof of unnecessary work.
- Generalize common-root grouping into explicit cleanup work units containing:
  - responsible upstream expression;
  - affected transformation sequence;
  - sink/file reach;
  - evidence level and trace gaps;
  - representative path and additional members.
- Re-rank the cleanup list around work units rather than isolated sinks.
- Add detector-level suppression/demotion when a path is recognized as a
  legitimate parser, serializer, validator, persistence, or mathematical
  boundary.

### Required repository gates

- Logo Dodo: derivative project/board/candidate representations.
- Visual Notes: parser/serializer and projection false-positive controls.
- Pluck: capture normalization/reconciliation work-unit grouping at scale.

### Exit gate

The cleanup queue presents a small set of high-leverage upstream opportunities,
and representation findings do not contradict successful Phase 4 cleanups.

## Phase 6: Consolidate the human interface and retire reports

### Objective

Make the map, cleanup queue, and focused explorer the coherent human product.

### Work

- Make the overview primarily the world map plus cleanup queue.
- Keep type/value trajectories, defenses, prop/context relay, and structural
  repeated-fork evidence accessible as explorer lenses.
- Move fan-in, fan-out, junction, boundary, raw-usage, and similar facts into map
  overlays, work-unit evidence, or expression detail where useful.
- Retire standalone report tabs that no longer serve a distinct human workflow.
- Retain CLI/Markdown views only where an agent or automation consumer is named.
- Do not preserve aggregate comparison formats without a concrete consumer.
- Produce terse agent breadcrumbs containing source, evidence, blast radius,
  confidence, and reproduction command.

### Required repository gates

Conduct a human review session on all four reference repositories. Starting from
the web overview, complete these tasks without opening a standalone report page:

- understand one important trajectory;
- identify the top three cleanup opportunities;
- inspect one proven, one suspicious, and one incomplete item where available;
- copy an agent-ready breadcrumb for one approved cleanup.

### Exit gate

The normal human workflow no longer depends on independent report pages, and the
remaining CLI/Markdown outputs have explicit agent-oriented purposes.

## Phase 7: Add strict change review

### Objective

Add a delta lens over the trusted whole-project graph without mixing pre-existing
problems into change review.

### Work

- Accept an explicit base/current change manifest independent of Git.
- Add Git range/diff generation as a convenience adapter.
- Record analyzer/tsconfig compatibility fingerprints.
- Match expressions/findings with proven, strong, weak, and unmatched confidence.
- Compare semantic facts, type transformations, defenses, work units, and reach.
- Attribute changed upstream causes to consequences in unchanged files.
- Present:
  - introduced or worsened regressions;
  - improvements and removals;
  - “possibly related” uncertain matches.
- Exclude known pre-existing findings from change-review mode.
- Exclude possibly-related items from the headline verdict.

### Tests

- added, modified, deleted, and renamed files;
- line shifts above unchanged sinks;
- mechanical refactors with no semantic delta;
- changed upstream values affecting unchanged sinks;
- incompatible configurations producing a useful partial/error state;
- weak matches never entering the main verdict.

### Required repository gates

Use representative historical or synthetic diffs from at least Logo Dodo and
Pluck. Include one large mechanical change and one small upstream change with a
large downstream blast radius.

### Exit gate

Change review shows a trustworthy delta: clear regressions in the main result,
uncertain attribution under “possibly related,” and no known pre-existing noise.

## Phase 8: Expand terminal sink families

### Objective

Extend the world model beyond render output while preserving the same interaction
and evidence principles.

### Delivery order

1. Database writes.
2. Filesystem/JSON writes.
3. Typed backend-to-backend requests.
4. Additional framework-specific server/client boundaries.

### Work

- Introduce explicit terminal-sink adapters rather than name-only heuristics.
- Allow trajectories to run toward TSX or toward persistence/external sinks.
- Preserve terminal kind in grouping, ranking, and visualization.
- Show bidirectional application loops where useful:

  ```text
  request -> server -> DTO -> resource -> context -> component -> JSX
  user input -> component state -> mutation -> server -> database
  ```

### Required repository gates

- Visual Notes: database document writes and serialized editor content.
- Pluck: capture/project/board JSON writes.
- Logo Dodo: project/board storage and generation service requests.
- HN Offline: persisted local/offline state where it fits the terminal model.

### Exit gate

The product can explain at least one complete read/render flow and one complete
edit/persist flow without creating a separate architecture product.

## Phase 9: Trusted agent execution loop and optional runtime evidence

### Objective

Automate only the findings that human review has demonstrated are stable.

### Work

- Emit compact cleanup packets for proven findings and human-approved suspicious
  work units.
- Include exact source, evidence, blast radius, uncertainty, requested outcome,
  and validation/reanalysis commands.
- Support a controlled loop:

  ```text
  analyze -> select one work unit -> agent fix -> verify -> reanalyze -> stop
  ```

- Stop when only suspicious or trace-incomplete evidence remains unless a human
  explicitly approves further investigation.
- Consider optional runtime snapshots only as annotations on static paths.
- Never treat absence in runtime samples as proof that a typed case is impossible.

### Exit gate

The agent loop can complete proven cleanups without oscillating between competing
analyzer recommendations or expanding into unrelated refactors.

## Dependency order

```text
Phase 0: real-repo baseline
  -> Phase 1: identity and evidence
    -> Phase 2: whole-project world map
      -> Phase 3: shapes and provenance
        -> Phase 4: first reliable detectors
          -> Phase 5: flip-flops and work units
            -> Phase 6: unified human product
              -> Phase 7: strict change review
              -> Phase 8: additional terminal sinks
                -> Phase 9: trusted agent loop
```

Phases 7 and 8 may proceed independently after Phase 6 if separate agents work on
them, but neither should weaken the shared identity/evidence model or recreate a
parallel UI/report system.

## Definition of overall success

The roadmap is successful when a developer can open an unfamiliar 10,000–100,000
line TypeScript application and, within one minute:

1. understand its broad source-to-terminal shape;
2. follow one important type/value through its transformations;
3. identify a high-leverage upstream cleanup opportunity and blast radius;
4. distinguish proven unnecessary work from suspicious or incomplete evidence;
5. hand a concise, grounded cleanup request to an agent.

At mature stages, the same analysis should support strict change deltas and a
stable agent cleanup loop, but those are consequences of trusted whole-project
analysis rather than substitutes for it.
