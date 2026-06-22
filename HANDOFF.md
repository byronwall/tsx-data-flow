# Handoff: Improve report *formatting & detail* of `tsx-dataflow`

**Goal for the next agent:** make the analyzer's reports easier to *read and act on*. The previous pass raised signal quality (ranking, fan-out de-noising, reachability — see git log / `docs/analyzer.md`). This pass is about presentation: render code as code, stop mangling multi-line expressions, and give the low-detail views (especially `fan-out`) enough context to act without re-grepping the repo. This is a **formatting/detail** pass on working logic — not a re-ranking and not a rewrite.

## Orientation

`tsx-dataflow` is a static render-path data-flow analyzer for TS/TSX (Solid/SolidStart-aware). It builds a typed graph from source expressions to JSX render sinks and projects it into ranked reports.

- `bin/tsx-dataflow.mjs` — CLI entrypoint (thin; delegates to core).
- `src/core.mjs` — **all logic lives here** (~1660 lines). The renderers are the target of this work:
  - `renderFindings` (`src/core.mjs:880`)
  - `renderWorkPackets` (`src/core.mjs:914`)
  - `renderDossier` (`src/core.mjs:954`)
  - `renderFanOut` (`src/core.mjs:971`) + `fanOutRows` (`src/core.mjs:1352`)
  - `renderFanIn` (`src/core.mjs:976`)
  - `renderPathGallery` (`src/core.mjs:986`)
  - `renderPathCensus` (`src/core.mjs:997`)
  - `renderPathFamilies` (`src/core.mjs:1015`)
  - `renderTransformationLedger` (`src/core.mjs:1020`)
  - `renderDefensiveLedger` (`src/core.mjs:1037`)
  - `renderPropRelay` (`src/core.mjs:1050`)
  - `renderContextRelay` (`src/core.mjs:1060`)
  - `renderRepairMap` (`src/core.mjs:1075`)
  - `appendFeatureClusters` (`src/core.mjs:1097`)
  - shared table helpers: `tableReport` (`src/core.mjs:1638`), `formatTableCell` (`src/core.mjs:1649`)
- `test/core.test.mjs` — Vitest, fixture-based (`pnpm test`). 16 tests today; renderers are asserted by `toContain` on substrings, so format changes will need test updates.
- `docs/analyzer.md` — design reference. Read "Output Projection" and "Report Construction".
- `skills/render-path-dataflow-work/SKILL.md` — the consumer of these reports; it decides work from `prop-relay`, `fan-out`, `repair-map`, `work-packets`. Formatting should serve *that* triage flow.

Use **pnpm**. Keep it **advisory and low-dependency** (TypeScript compiler API only). Output must stay valid Markdown / JSON.

## The core defect: two rendering styles, one of them broken

There are two families of renderers:

1. **Table renderers** (`fan-out`, `fan-in`, `path-families`, `defensive-ledger`, `prop-relay`, `context-relay`, feature-cluster tables) go through `tableReport` → `formatTableCell`, which **escapes newlines and pipes** (`src/core.mjs:1649-1651`). These are structurally sound.
2. **Indented-text renderers** (`findings`, `work-packets`, `transformation-ledger`, `path-gallery`, `repair-map`, `dossier`) hand-build lines with **2-space indentation and no escaping**. These are the broken ones.

The indented renderers emit code (expressions, paths, aligned metric blocks) but **never fence it**. In GitHub-flavored Markdown a 2-space indent does *not* create a code block (that needs 4 spaces or ``` fences), so this content renders as collapsed, re-wrapped prose — alignment lost, and any expression containing a newline shatters the layout.

## Evidence: real `modeler` output (reproduce into `tmp/evals/` — see Validation)

**1. Code rendered without fences (every indented renderer).** From `findings`:

```
Sink
  roadLabelId() ? `#${roadLabelId()}` : undefined

Metrics
  path depth:                 22
  helper hops:                86
```

The aligned `path depth: 22` block only looks aligned in a terminal; in rendered Markdown the leading spaces collapse and columns disappear. The `Sink` expression is code shown as prose.

**2. Multi-line expressions destroy the layout.** A single representative-path step is an object literal with raw newlines, in `work-packets`, `findings`, `path-gallery`, and worst in `transformation-ledger` where it orphans the trailing column:

```
14  {
      readings: allReadings,
      start: props.start,
      end: props.end,
   data-flow
```

Tables escape this via `formatTableCell`; the indented renderers have no equivalent.

**3. Truncation cuts mid-token with no ellipsis.** Labels/expressions are `slice(0, 80)` (see `addOperationTrace` `src/core.mjs:666` and `getSinkExpression` `src/core.mjs:452`), producing `...relationship : undefin` and `link-${labelParts()` cut mid-identifier. There is no `…` to signal truncation.

**4. `fan-out` has no location detail — the user's explicit complaint.** Columns are `Source | Sinks | Components | Operations`:

```
| props.entity | 151 | 21 | 1840 |
| props.value  | 42  | 8  | 467  |
| item         | 41  | 9  | 540  |
```

You cannot act on `props.entity` without grepping: *which* files, *where* is it defined, what's a representative sink? `Operations` (a sum of `sliceSize`) is opaque. The view needs at least an example file/component and ideally the originating file.

**5. The `findings` `Source` line is an unreadable blob** (`src/core.mjs` `renderFindings`, joins `sink.roots`):

```
Source
  props.meta, "Relationship", undefined, [], 0, props.start, props.end, false, useTapestry, "", document, "http://www.w3.org/2000/svg", "path", args.isStartLeft, ..., (reading) => (reading.ownerId ?? reading.owner?.id) === relevantOwner.id
```

It mixes actionable roots (`props.meta`), literals (`0`, `""`, `[]`), type/operator text (`typeof firstPart`, `"string"`), globals (`document`), and even an arrow-function body. The analyzer now has `sink.rootInfos` with a `kind` per root, and `fanOutRootsFor` (`src/core.mjs`) already encodes "actionable source" — reuse it here.

**6. Mislabeled scope field in `work-packets`.** It prints `components: 20` (that value is `mergeWidth`, the distinct-root/fan-in count) directly under `files: 1`. "20 components in 1 file" is contradictory. Rename to what it is (e.g. `source inputs:` / `fan-in:`).

**7. `transformation-ledger` third column is non-informative.** Every row says `data-flow` except the last (`JSX text`). The graph knows the real operation kind per step (`property-read`, `fallback`, `call`, `object-pack`, `solid-accessor`); surface that instead.

**8. Table cells that are code aren't marked as code.** `defensive-ledger` Expression/Type columns and `path-families` signatures are raw text in table cells; wrapping code-ish cells in backticks would render them monospaced (mind `formatTableCell`'s pipe-escaping — backticks + escaped pipes coexist fine).

## Prioritized tasks

Do these as independent, separately-validated slices. After each, re-run the relevant view on `modeler` and eyeball the rendered Markdown (preview it, don't just cat it).

**P1 — Fence all code-like output in the indented renderers (highest leverage, lowest risk).**
- Add a shared helper (mirror of `tableReport` for prose blocks) that wraps expression/path/metric blocks in fenced ``` code blocks. Apply to `renderFindings`, `renderWorkPackets`, `renderTransformationLedger`, `renderPathGallery`, `renderRepairMap`, `renderDossier`.
- Keep section headers (`Sink`, `Metrics`, `Representative path`) as Markdown (bold or `###`), and put the monospace payload inside fences so alignment survives.
- Acceptance: every code/expression/aligned-metric block in those views is inside a fence or a table; nothing relies on 2-space indentation to read as code.

**P2 — One-line + ellipsis-truncate every rendered expression (shared helper).**
- Add a single `formatExpression(text, max)` helper that collapses internal whitespace/newlines to single spaces and truncates on a token-ish boundary with a trailing `…`. Route every expression/path-step/label render through it (representative paths, sink expressions, ledger rows). This is the prose-renderer analogue of `formatTableCell`.
- Replace the bare `slice(0, 80)` truncations (`src/core.mjs:666`, `src/core.mjs:452`, and any in renderers) so they share this logic and never cut mid-token without `…`.
- Acceptance: no rendered report contains a raw newline inside a path step, table cell, or ledger row; no truncation ends mid-identifier without `…`.

**P3 — Give `fan-out` actionable location detail (the explicit ask).**
- In `fanOutRows` (`src/core.mjs:1352`), per source also collect: an example sink (`file:line`), and either the top 1–3 files the source appears in or the file where it most likely originates. Add column(s) to `renderFanOut` (`src/core.mjs:971`) — e.g. `Source | Sinks | Files | Example sink`. Consider replacing the opaque `Operations` sum with something legible (max path depth, or drop it).
- Keep `--max-items` honored and the table valid (escape via `formatTableCell`).
- Acceptance: a reader can open the first file for the top `fan-out` row without grepping; no column is an unexplained aggregate.

**P4 — Fix the `findings` `Source` line.**
- Render only actionable roots — reuse `fanOutRootsFor`/`rootInfos` to drop literals, bare params, globals, type/operator text, and inline function bodies. Cap the count and add `(+N more)` rather than dumping everything.
- Acceptance: the `Source` line lists named domain sources (`props.meta`, `useTapestry`), not literals/globals/lambda bodies.

**P5 — Make `transformation-ledger` step kinds real.**
- Carry the per-step operation kind (already on graph nodes / available via the trace) into the ledger so the third column shows `property-read` / `fallback` / `call` / `object-pack` / `solid-accessor` / `JSX text` instead of a constant `data-flow`. Consider the same enrichment for `representativePath` rendering (show the operation, not just the label).
- Acceptance: ledger rows name distinct operations; the column carries information.

**P6 — Polish (do last, low risk).**
- Rename the mislabeled `components:` scope field in `work-packets` (it's `mergeWidth`/fan-in, not component count).
- Wrap code-ish table cells (`defensive-ledger` Expression/Type, `path-families` signatures) in backticks via `formatTableCell` or at the call sites.
- `dossier` summary line could be a small table; minor.

## Validation protocol

For every change:

```bash
pnpm test                       # must stay green; update/extend renderer tests

# Re-run the views you touched and READ the rendered Markdown, not just the raw text.
ROOT=/Users/byronwall/repos/modeler/client/apps/modeler
for v in findings work-packets transformation-ledger path-gallery repair-map dossier fan-out; do
  node bin/tsx-dataflow.mjs --root "$ROOT" --view "$v" --max-items 5 --out "tmp/evals/$v.md"
done
```

- **Add/adjust tests in `test/core.test.mjs`.** Existing renderer tests assert substrings (`toContain("WORK ITEM DF-001")`); fenced output may move those substrings, so update them and add assertions for the new structure (e.g. fences present, no raw newline inside a path step, `fan-out` has a file column, `Source` excludes literals). Fixtures use `createFixtureProject`; add a fixture with a multi-line object-literal sink to lock in P2.
- The `--format json` payload (`selectViewPayload`) must stay unchanged in shape — these are Markdown-rendering changes only. If you enrich data (P3/P5), thread it through without breaking the JSON contract, and spot-check `--format json` still parses.
- Spot-check one rendered report visually (Markdown preview) to confirm code now reads as code.

## Constraints / guardrails

- **Markdown-rendering changes only.** Do not change ranking, metrics math, queue thresholds, or which sinks are selected. (That work just landed; don't churn it.)
- Keep it **advisory and low-dependency** — TypeScript compiler API only, no new runtime deps, no Markdown library.
- Don't regress the table renderers that already work (`fan-out`'s *content*, `prop-relay`, `fan-in`, `context-relay`, `defensive-ledger`, `path-families`). P3 changes `fan-out`'s columns deliberately; the others should stay stable.
- Preserve `file:line` strings as plain text where they are (they're terminal-clickable); fences are for expressions and aligned blocks, not for locations you want clickable.
- The `ts` unused-binding warnings at `src/core.mjs:666` and `src/core.mjs:731` are pre-existing and harmless; ignore unless you refactor those functions.
- Don't over-fit to `modeler`; it's one sample. Fixture tests are the correctness anchor, `modeler` is the smell test.
