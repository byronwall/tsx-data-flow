# Phase 1 Runbook: Unified Identity and Expression Evidence

## Scope and exit gate

This runbook tracks Phase 1 of [`overall-execution-plan.md`](overall-execution-plan.md). Phase 1 stops when selecting a participating expression exposes checker-backed identity, definitions, usages, attached findings, terminal reach, and trace completeness in the code-map workspace.

## Implementation checklist

- [x] Read the governing plans and repository structure guidance.
- [x] Add a generation-local analyzer-domain identity/evidence model.
- [x] Index project-local definitions and usages with TypeScript symbols.
- [x] Resolve import aliases to their canonical symbol.
- [x] Attach initial identity evidence to participating render expressions.
- [x] Add focused tests for same-name separation, aliases, and incomplete evidence.
- [x] Expand identity participation to graph facts, types, boundaries, and terminal sinks.
- [x] Standardize upstream/downstream paths, defenses, representation steps, unknown boundaries, terminal reach, and evidence levels on the shared model for participating render expressions.
- [x] Attach existing findings and graph facts to shared identities.
- [x] Add strict identity/evidence DTO schemas and malformed-payload tests.
- [x] Project expression evidence into the file API without analyzer-domain imports in the frontend.
- [x] Make all participating source expressions selectable in the code map.
- [x] Add definition/usage navigation and frontend tests while preserving deterministic initial DOM structure.
- [x] Evaluate HN Offline and record results under `docs/evaluations/`.
- [x] Evaluate Logo Dodo and record results under `docs/evaluations/`.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` cleanly for Slice 1.

## Progress log

### 2026-07-11 — Slice 1: analyzer identity foundation

- Added generation-local IDs for participating expressions and their canonical TypeScript symbols.
- Added a checker-backed project index of definition and use locations.
- Canonicalized import aliases before assigning identity, so renamed imports point to the exported declaration.
- Kept same-spelled but distinct symbols separate by using TypeScript symbol identity rather than text.
- Attached trace completeness, a human-readable completeness reason, and the initial evidence level to render expressions.
- Unresolved or non-symbol expressions are explicitly marked `trace-incomplete`.

Slice 1 stopping point: analyzer-domain only, before DTO/UI exposure. Composite expressions also need a richer participating-subexpression model; the initial subject resolver covers identifiers, property access, element access, calls, and parentheses.

### 2026-07-11 — Slice 2: strict transport and code-map navigation

- Added a strict expression-evidence API schema with generation-local IDs, definition/usages, trace completeness, and evidence level.
- Added rejection coverage for malformed evidence levels, empty completeness reasons, and analyzer-only extra fields.
- Projected evidence into finding details using transport-owned source points; the frontend continues to import only API contract types.
- Added a compact Identity and usage section to the selected code-map expression.
- Same-file definitions/usages scroll within the existing source pane; cross-file usages link to the target file and line.
- Kept the initial Solid DOM deterministic: no `window`, `document`, viewport, time, or random value controls render structure.

Current limitation: selection starts from existing render-expression annotations. Traced subexpressions, graph facts, and non-finding expressions do not yet have independent selectable spans.

### 2026-07-11 — Slice 3: shared trace and finding evidence

- Composite render expressions now select a checker-backed participating symbol instead of defaulting to incomplete evidence. Supported wrappers include binary/conditional expressions, calls, casts, non-null assertions, templates, arrays, and object literals.
- Standardized upstream/downstream paths, terminal sinks, total reach, defenses, representation steps, unknown boundaries, attached finding IDs, and graph-node IDs on the analyzer-domain evidence object.
- Evidence levels now distinguish proven unnecessary evidence, suspicious transformations, trace-incomplete results, and browsable facts.
- Linked terminal graph nodes back to the owning expression ID.
- Extended the strict DTO to carry the standardized evidence without exposing analyzer-domain types.
- The code-map identity panel now shows terminal reach, finding attachment, and unknown-boundary status alongside definition and where-used navigation.

Current limitation: the standardized evidence is complete for participating render expressions and their terminal node. Identity still needs to expand to independently selectable traced subexpressions, boundary facts, and non-terminal graph nodes.

### 2026-07-11 — Real-repository gate 1

- Evaluated HN Offline in 2.69 seconds. Same-named story accessors and different `id` properties remained separate; rendered story/comment expressions navigated to checker-backed definitions and usages.
- Evaluated Logo Dodo in 8.92 seconds. `Candidate.status`, `Candidate.index`, `Board.imageUrl`, and `Board.themeName` navigated from workbench TSX to canonical declarations with usages across many files.
- Fixed an evaluation-discovered boundary bug: standard-library declarations under a target repository's `node_modules` are now external, trace-incomplete evidence rather than project-local definitions.
- Recorded detailed results in [`phase1-hn-offline.md`](../evaluations/phase1-hn-offline.md) and [`phase1-logo-dodo.md`](../evaluations/phase1-logo-dodo.md).

Both repository gates initially produced partial passes and identified the remaining exit-gate work. Slice 4 below closes those gaps and the final reruns pass.

### 2026-07-11 — Slice 4: selectable traced expressions and complete generation identities

- Retained every traced branch instead of only the representative longest path.
- Added exact source spans and checker-backed evidence for independently selectable traced expressions.
- Added generation-local type, boundary, graph-node, and terminal identities.
- Consolidated shared expressions across affected findings and terminal sinks in the file DTO.
- Added direct source selection, URL restoration through `?expression=`, upstream/downstream path details, and attached-finding links.
- Used graph indexes for path lookup. An initial Logo Dodo run exposed an O(expressions × graph) implementation at 28.84 seconds; incremental node/edge indexes reduced the final run to 7.90 seconds.
- Kept per-file trace identities out of bounded CLI sink rows, reducing the Logo Dodo JSON evaluation artifact from 100 MB while preserving the richer file API.
- Hard-refreshed the real HN Offline story page, selected `story()` directly, and verified definition, usages, type, findings, reach, boundaries, and paths with no browser/hydration errors.

Phase 1 exit gate: passed.

### 2026-07-11 — Post-gate UX correction: sink selection versus value selection

- Separated finding selection from value identity. A finding now describes the selected sink expression, its expression type, render role, and terminal reach.
- Added a compact list of values inside the sink expression, each linking to its own checker-backed evidence.
- Added focused symbol spans so a property expression such as `section().sampleCount` makes the `sampleCount` token—not the entire comparison—directly selectable.
- Deduplicated overlapping expression annotations by focused token and preferred the most informative complete value expression.
- Removed anonymous expression markers from the gutter. Findings and analysis facts remain in the gutter; selectable values are indicated directly in source with a subtle dotted underline and descriptive hover label.
- Relabeled value evidence to distinguish the selected value, referenced symbol, value type, symbol uses, and path-level status.
- Changed suspicious/proven labels on constituent values to “part of … path,” avoiding the claim that an ordinary comparison or property read is itself suspicious.
- Validated the reported Pluck example: the sink predicate is `boolean`, `section` is an `Accessor<TypographySectionView>`, and selectable `sampleCount` is a `number` defined on `TypographySectionView`.
- Fixed participant navigation so selecting a value inside a finding immediately replaces the finding panel with that value's evidence; URL-restored selections now also take precedence over stale local selection.
- Restored compact same-file locations as `line N`, while cross-file locations retain `filename:line`.
- Removed list indentation from upstream/downstream evidence paths and emphasized the current filename over its directory in the top bar.
- Added a distinct amber jump-target state for definition, usage, path, hash, and line-number navigation. The target persists after scrolling and briefly pulses on arrival without replacing the blue identity/finding selection state.
- Removed horizontal grid rules between source lines so clickable token underlines remain the dominant fine-grained visual cue; vertical column separators remain intact.
- Moved the amber jump-target marker into a reserved gutter outside the source table so it no longer competes with finding indicators.
- Separated entity selection from line navigation: choosing a finding, boundary, fan-out, prop read, or symbol now highlights only that interactive item and merely scrolls it into view; only explicit line/hash navigation creates the amber line target.
- Restricted the project identity index to symbols with real declarations in participating source files. Ambient/platform and external declaration symbols such as `Math`, `Math.round`, array methods, and DOM globals no longer collect project-wide usage lists, become selectable source identities, or enter the file-page expression payload.
- Added compact Copy JSON actions to findings, expressions, and every non-finding inventory detail so an agent discussion can be grounded without screenshots or oversized payloads.
- Reframed expression path status as inclusion in an attached finding rather than suspicion of the selected value itself. Expression details now explain that scoring applies to the terminal path as a whole and show each attached finding's expression, burden terms, recommendation, and inspection link.

## Verification log

- Focused identity tests: 2 passed.
- Typecheck: passed (server and frontend).
- Full tests after Slice 2: 24 files, 151 tests passed.
- Build: passed (server and frontend).
- Lint: the first run found one type-import style violation; fixed and re-run cleanly.
- Real-repository gates: passed for HN Offline and Logo Dodo.
- Slice 2 focused verification: API contract, server projection, identity, and code-map tests passed; server/frontend typecheck passed.
- Slice 2 full verification: lint, 151 tests, server/frontend build, and `git diff --check` passed.
- Slice 3 focused verification: 26 analyzer/API/server/frontend tests and server/frontend typecheck passed.
- Slice 3 and real-gate full verification: lint, server/frontend typecheck, 151 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Slice 4 focused verification: 28 analyzer/API/server/frontend/JSON tests passed.
- Slice 4 final verification: lint, server/frontend typecheck, 153 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Post-gate UX correction verification: lint, server/frontend typecheck, 155 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Participant-navigation and location-layout follow-up: lint, server/frontend typecheck, 156 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Jump-target highlighting follow-up: lint, server/frontend typecheck, 156 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Ambient/platform identity exclusion: lint, server/frontend typecheck, 158 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Copy JSON and finding-basis explanation follow-up: lint, server/frontend typecheck, 158 tests across 24 files, server/frontend build, and `git diff --check` passed.
- Browser verification: real HN file hard refresh and direct `story()` selection passed with no console or hydration errors.
