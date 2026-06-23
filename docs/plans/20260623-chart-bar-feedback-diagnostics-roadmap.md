# Chart Bar Feedback: Diagnostics and Reporting Roadmap

**Date:** 2026-06-23
**Source feedback:** `/Users/byronwall/repos/modeler/tmp/data-flow/20260623-chart-bar-tsx-dataflow-report.md`
**Target:** `src/core.mjs`, `test/core.test.mjs`, `README.md`, `docs/analyzer.md`
**UI scope:** No new UI. This is CLI/report output, report wording, scoring, and tests.

## Customer-Visible Outcome

`tsx-dataflow` should keep the parts that worked in the chart-bar cleanup, but make the generated guidance more precise. A user should see one cohesive recommendation for related SVG bar/tick work, better names in fix suggestions, fewer provider/context false positives, lower priority for harmless scalar helpers, and an explicit stop signal when the remaining work is not worth chasing.

## Source Scenario

The feedback came from a focused cleanup of:

- `/client/apps/modeler/src/components/tiles/chart-bar.tsx`

The analyzer was run before and after local refactoring with:

```sh
tsx-dataflow --root . --view all --max-items 20 --file client/apps/modeler/src/components/tiles/chart-bar.tsx --out tmp/data-flow/20260623-chart-bar-baseline

tsx-dataflow --root . --view all --max-items 20 --file client/apps/modeler/src/components/tiles/chart-bar.tsx --out tmp/data-flow/20260623-chart-bar-after-third-look
```

The cleanup was scoped to a pure SVG chart renderer. The useful final code shape extracted render-ready values:

- `BarRect[]` for rendered bar rectangles: `x`, `y`, `width`, `height`, `color`, `title`.
- `BarTick[]` for x-axis ticks: `label`, `x`, `showLabel`.
- `truncateAxisLabel` and `formatBarTitle` for text formatting.
- Narrow scalar accessors for axis line and title coordinates rather than one broad `axisModel` object.

## Detailed Breakdown Of Work And Problems

### What tsx-dataflow Got Right

1. **Type-impossible fallback detection was directly useful.**

   The baseline defensive ledger flagged `series.values[i()] ?? 0` as impossible because `series.values` is typed as `number[]` in the checked program. Removing the fallback simplified the render path and eliminated a real stale-defense finding.

2. **The work packets identified repeated bar geometry as meaningful.**

   Separate sink-local packets for `x`, `y`, `width`, `height`, and title formatting all pointed to the same underlying issue: nested JSX callbacks were deriving collection layout, y-scale mapping, sign handling, formatting, and attributes inline. The correct fix was not five independent edits; it was one cohesive `BarRect[]` extraction.

3. **The second analyzer pass correctly criticized a mirror object.**

   An intermediate `axisModel` object lowered some path depth, but it only repacked unrelated scalar facts such as axis y, end x, title position, and title visibility. The later `mirror object` verdict was good feedback and pushed the code toward narrower scalar helpers.

4. **Before/after metrics were directionally useful.**

   The cleanup moved useful indicators in the right direction:

   | Metric                   |               Baseline |                   Final | Interpretation                                                                |
   | ------------------------ | ---------------------: | ----------------------: | ----------------------------------------------------------------------------- |
   | Defensive ledger entries |                      2 |                       0 | Dead fallbacks were removed.                                                  |
   | Worst score              |                   0.73 |                    0.49 | High/type-impossible work was removed; remaining worst item was low severity. |
   | Hotspots                 |                     55 |                      50 | Some related paths collapsed, although the raw count still looked noisy.      |
   | Wrapper/relay noise      | 94 after first cleanup |                24 final | Render-item extraction reduced repeated wrapper paths.                        |
   | Ownership hint           |   architectural fan-in | local component cleanup | Classification moved closer to the real nature of the file.                   |

### Where Diagnostics Misled

1. **Provider/Context audit was wrong for a pure chart renderer.**

   The report repeatedly suggested `Provider/Context audit` for `components/tiles`, even though the file had no provider/context ownership issue. The right first cut was local render-data extraction. Provider/context advice should require evidence such as `createContext`, `useContext`, Provider JSX, feature hook roots, or broad props crossing component boundaries.

2. **Generated fix names were too generic.**

   Names like `geometryModel`, `renderValue`, `selectedValue`, and `ItemModel` are mechanically understandable but poor code guidance. The successful cleanup used rendered-thing names: `BarRect`, `BarTick`, `rects`, `ticks`, `formatBarTitle`, and `truncateAxisLabel`.

3. **Some recommendations rewarded moving complexity instead of improving shape.**

   Generic wording like "extract geometry model" made it too easy to create a singleton object bag. The better distinction is:
   - Good: cohesive repeated item data, such as `BarRect[]` and `BarTick[]`.
   - Risky: broad singleton bags whose fields are each read once, such as `axisModel`.

4. **Remaining final findings were mostly scalar-helper noise.**

   Final reports still flagged values like `tickY()`, `tickLabelY()`, `hasAxisTitle()`, `showAxes()`, and `titleX()`. These are readable local helpers. Chasing them would likely make the chart code worse.

5. **Shared cohesive helper paths ranked too prominently.**

   A final low-severity finding through `computeChartLayout() -> layout().innerWidth` was not a strong cleanup target. A clear shared helper returning a cohesive type such as `ChartLayout` should be background context, not a top local cleanup recommendation.

6. **The final hotspot count lacked a stop interpretation.**

   Seeing 50 remaining hotspots sounds bad, but the remaining work was low severity and mostly normal SVG/chart scalar math. The tool needs to say when the local cleanup has reached diminishing returns.

## Ratings

| Dimension                             | Current score | Why                                                                                                                                                         | Target |
| ------------------------------------- | ------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Dead defensive fallback detection     |             9 | The ledger found real stale fallback logic and the result was safe to remove under checked types. It could explain the exact TypeScript proof more clearly. |     10 |
| Render-path trace usefulness          |             8 | Paths exposed the repeated geometry/title derivation that normal linting would miss. Some final paths were technically true but not useful.                 |     10 |
| Work-packet grouping                  |             6 | Multiple packets converged on one `BarRect[]` fix, but the report did not present them as one grouped recommendation.                                       |     10 |
| Fix suggestion specificity            |             5 | Candidate edits pointed in the right general direction but used vague names and generic shapes.                                                             |     10 |
| Naming quality in generated proposals |             4 | `geometryModel`, `renderValue`, `selectedValue`, and `ItemModel` invite bland or misleading code.                                                           |     10 |
| Provider/context diagnostic precision |             3 | The most misleading item was repeated provider/context advice for a local SVG chart renderer.                                                               |     10 |
| Mirror-object detection and feedback  |             8 | The rerun caught `axisModel` correctly. The first proposal should discourage that shape earlier.                                                            |     10 |
| Scalar-helper noise control           |             4 | Low-value helpers stayed visible after the meaningful cleanup was done.                                                                                     |     10 |
| Shared-helper boundary judgment       |             5 | Cohesive helpers such as `computeChartLayout` still looked like cleanup targets.                                                                            |     10 |
| Before/after evaluation UX            |             5 | Metrics were useful only after manual comparison across output directories.                                                                                 |     10 |
| Stop-signal/report confidence         |             3 | The tool did not explain that remaining findings were mostly harmless and low leverage.                                                                     |     10 |
| Overall agent fix loop                |             6 | The tool helped produce a better file, but an agent had to reinterpret and correct several suggestions.                                                     |     10 |

## Plan To Get Closer To 10

### Milestone 1: Gate Provider/Context Advice

**Outcome:** Pure local renderers no longer receive provider/context audit as the headline fix unless the trace contains actual context or cross-component relay evidence.

Implementation changes:

- Tighten `isProviderContextCandidate` so high depth, high reachable-sink count, or merge width alone is insufficient.
- Require at least one evidence signal: context hook root, `createContext`, `useContext`, Provider JSX, same-feature prop pass-through across components, or an imported feature hook/accessor boundary.
- Update `featureClusterRows` so a feature cluster reports `Provider/Context audit` only when provider/context signals are a meaningful share of the cluster, not when one local path happens to be deep.
- Fall back to local first cuts such as `extract render item data`, `extract geometry values near SVG sinks`, or `normalize collection item rendering`.

Verification:

- A focused chart renderer fixture with many geometry sinks but no context evidence reports local render-data cleanup.
- A fixture with broad same-feature prop relay through multiple components still reports provider/context audit.
- Existing provider/context tests continue to identify real cross-component ownership pressure.

Sample report output:

```md
## Feature Clusters

| Feature area     | Sinks | Files | Max depth | Wrappers | Suggested first cut      | Evidence                                       |
| ---------------- | ----- | ----- | --------- | -------- | ------------------------ | ---------------------------------------------- |
| components/tiles | 50    | 1     | 16        | 24       | Extract render item data | no provider/context signals                    |
| routes/dashboard | 31    | 4     | 14        | 42       | Provider/Context audit   | useDashboardState(), prop relay across 4 files |

Why not Provider/Context for components/tiles:

- no createContext/useContext/Provider evidence
- one local TSX renderer owns the relevant SVG geometry
- dominant shape is geometry-chain, not cross-component-relay
```

### Milestone 2: Group Related SVG And Collection Sink Recommendations

**Outcome:** Related `x`, `y`, `width`, `height`, `style`, and title packets become one grouped recommendation when they share the same component, collection loop, source roots, and sink family.

Implementation changes:

- Extend `computeWorkUnits` or add a report-layer grouping pass for same-file, same-component, same-pivot, same-JSX-element groups.
- Add a `Grouped recommendation` block for cohesive render-item extraction.
- Include the rendered thing, file, component, sink family, fields, and reason.
- For this scenario, the desired shape is:

```md
Grouped recommendation: Extract bar rectangles
Component: BarRects
Sinks: rect x/y/width/height/title/style
Suggested shape: BarRect[] via createMemo
Why: same category/series/groupWidth/barWidth/yPixel path feeds all rect attributes.
```

Verification:

- A bar chart fixture emits one `Extract bar rectangles` recommendation instead of independent top-level geometry packets.
- `--units` and default `work-packets` remain stable for unrelated findings.
- Grouping does not combine geometry, text, style, identity, and control-flow when the pack verdict says they should stay separate.

### Milestone 3: Replace Generic Suggested Names With Render-Context Names

**Outcome:** Extraction proposals name the rendered thing instead of using analyzer jargon.

Implementation changes:

- Thread JSX element context into sink records: tag name, attribute name, component/function name, nearby `data-part`/`data-scope`, and maybe collection callback item names when available.
- Replace `proposedHelperName` outputs like `geometryModel`, `selectedValue`, `renderValue`, and `itemModels` with names derived from render context.
- Use singular/plural rendered nouns:
  - `<rect>` in `BarRects` plus geometry fields -> `barRect`/`barRects` or `computeBarRect`.
  - `<text>` in `BarXAxis` tick loop -> `barTick`/`ticks`.
  - `<title>` text -> `formatBarTitle`.
- Expand `BANNED_SUGGESTION_IDENTIFIERS` to include `geometryModel`, `renderValue`, `selectedValue`, `profileData`, `ItemModel`, and `*Model` unless supported by local code context.

Verification:

- Proposal text contains `rects`, `ticks`, or similarly concrete names for chart fixtures.
- No generated identifier contains banned analyzer jargon.
- Existing tests that asserted generic names are updated to assert rendered-thing names.

Sample report output:

```md
**Extraction proposal**

proposed: const rects = createMemo<BarRect[]>(() => ...)
fields: x, y, width, height, color, title
after: <rect> reads rect.x / rect.y / rect.width / rect.height
avoid: geometryModel, renderValue, selectedValue, ItemModel

Name source:

- component: BarRects
- JSX element: rect
- sink family: geometry + text
- rendered noun: bar rectangle
```

### Milestone 4: Distinguish Cohesive Render Items From Mirror Objects Before Suggesting Extraction

**Outcome:** The first report discourages broad singleton bags instead of relying on a second run to catch them.

Implementation changes:

- Before recommending object extraction, classify the likely target shape:
  - `cohesive repeated item`: multiple fields consumed together per item in a collection render.
  - `cohesive layout boundary`: shared helper returns a named layout type used across related sinks.
  - `mirror singleton`: object mostly repacks source fields or unrelated scalar values.
  - `overpacked bag`: object mixes geometry, text, identity, style, and control-flow responsibilities.
- Change geometry candidate edits from "extract geometry model" to wording that makes the singleton risk explicit:
  - "For repeated rendered items, extract `BarRect[]`/`BarTick[]`. If this would become a singleton object whose fields are read once, prefer narrow scalar helpers."

Verification:

- A fixture similar to `axisModel` receives a mirror-object warning before the user reruns.
- A fixture similar to `BarRect[]` is encouraged as cohesive repeated item data.
- The mirror warning does not fire for typed parser/normalization boundaries.

Sample report output:

```md
**Extraction shape check**

Verdict: mirror singleton risk
Candidate: axisModel

This object would mostly gather unrelated scalar reads that are each consumed once:

- y: props.innerTop + props.innerHeight
- endX: props.innerLeft + props.innerWidth
- titleX: props.innerLeft + props.innerWidth / 2
- titleY: props.height - 4

Recommendation: keep narrow scalar helpers (`axisY`, `axisEndX`, `titleX`, `titleY`) unless a rerun shows multiple fields are consumed together as one rendered item.
```

For a cohesive repeated item, the report should instead encourage the extraction:

```md
**Extraction shape check**

Verdict: cohesive repeated item
Rendered thing: bar rectangle
Suggested shape: BarRect[]
Reason: the same category/series item feeds x, y, width, height, color, and title for one <rect>.
```

### Milestone 5: Downrank Harmless Scalar Helpers

**Outcome:** Final reports stop spending top slots on clear, local scalar helpers once high-value work is done.

Implementation changes:

- Add a low-value scalar-helper classifier when all are true:
  - maximum path depth is small, for example <= 6 or <= 7;
  - no impossible defenses;
  - no defensive operations;
  - no representation churn;
  - no object pack risk;
  - operations are simple reads/arithmetic;
  - helper names are clear local nouns or coordinate names.
- Apply a burden penalty or move these to a `background`/`already readable` classification.
- Render a short note rather than a full work packet when they remain after higher-signal findings.

Verification:

- `tickY()`, `tickLabelY()`, `titleX()`, and similar helpers do not dominate work-packets.
- A confusing scalar helper with fallbacks or object packing still appears.
- Findings view can still show scalar helpers when explicitly requested with a large `--max-items`.

Sample report output:

```md
## Background Findings

These paths are true but not recommended as cleanup work:

| Location          | Expression   | Classification   | Reason                                                       |
| ----------------- | ------------ | ---------------- | ------------------------------------------------------------ |
| chart-bar.tsx:115 | tickY()      | already readable | local scalar helper; depth 4; no defenses; no object packing |
| chart-bar.tsx:116 | tickLabelY() | already readable | local scalar helper; simple arithmetic offset                |
| chart-bar.tsx:92  | titleX()     | already readable | named coordinate helper; JSX is clearer with the helper      |

Action: leave these unless adjacent edits make them redundant.
```

### Milestone 6: Respect Cohesive Shared Helpers

**Outcome:** Shared helpers like `computeChartLayout` are evaluated as possible healthy boundaries, not automatically treated as cleanup targets.

Implementation changes:

- Reuse boundary-report verdicts inside rankings and work-packet prose.
- Downrank paths dominated by a first-party helper when:
  - the helper name is domain-specific and clear;
  - the return type is concrete and cohesive, such as `ChartLayout`;
  - the sink reads an expected field from that return type;
  - internal helper debt is low and there are no impossible defenses.
- Add wording: "healthy shared boundary; leave it unless adjacent findings show overpacking or type leakage."

Verification:

- `computeChartLayout() -> layout().innerWidth` style paths become background context.
- Leaky or junction helpers remain visible in `boundary-report`, `junctions`, and work-packets.
- Ranking still surfaces shared helpers when they hide defaults, type leakage, or broad object churn.

Sample report output:

```md
**Boundary judgment**

computeChartLayout() chart-helpers.ts:18
Verdict: healthy shared boundary
Return type: ChartLayout
Reads: innerWidth, innerHeight, innerLeft, innerTop

Why this is background:

- helper name is domain-specific
- return type is cohesive
- sink reads an expected layout field
- no impossible defenses or pack-risk behind this path

Action: leave this helper alone; focus on local render-item extraction first.
```

### Milestone 7: Add Before/After Compare Output

**Outcome:** Users can verify cleanup impact without manually diffing report directories.

Implementation changes:

- Add a `compare` command or `--compare <baseline-dir>` mode that reads two `--view all` output directories or JSON dossiers.
- Summarize key changes:
  - worst score and severity;
  - hotspot count;
  - defensive ledger entries;
  - wrapper/representation counts;
  - removed, improved, new, and remaining finding families;
  - stop recommendation.
- Keep output markdown-first and suitable for agents to paste into cleanup reports.

Verification:

- Comparing the chart-bar baseline and final directories would produce a concise improvement summary.
- Regressions are highlighted separately from expected remaining low-severity items.
- Missing optional report files degrade gracefully with a clear message.

Sample report output:

```md
# tsx-dataflow Compare

Baseline: tmp/data-flow/20260623-chart-bar-baseline
After: tmp/data-flow/20260623-chart-bar-after-third-look

## Summary

| Metric            | Baseline  | After    | Delta    |
| ----------------- | --------- | -------- | -------- |
| Worst score       | 0.73 HIGH | 0.49 LOW | improved |
| Hotspots          | 55        | 50       | -5       |
| Defensive entries | 2         | 0        | -2       |
| Wrappers          | 94        | 24       | -70      |

## Removed finding families

- type-impossible fallback: series.values[i()] ?? 0
- nested bar rectangle geometry: x/y/width/height/title

## Remaining finding families

- local scalar helpers: tickY, tickLabelY, titleX
- healthy shared layout boundary: computeChartLayout -> layout().innerWidth

Verdict: improvement; stop local cleanup unless broader chart architecture work is planned.
```

### Milestone 8: Add A Stop Signal

**Outcome:** The report tells agents when more local cleanup is likely counterproductive.

Implementation changes:

- Add a `Stop recommendation` section to `work-packets`, `repair-map`, and compare output when the remaining top findings match stop criteria.
- Suggested stop criteria:
  - no defensive ledger entries remain;
  - highest score is low;
  - remaining findings are mostly scalar helpers or healthy shared-boundary reads;
  - no pack verdicts are `overpacked-bag`, `relay-bag`, or `mirror-object` above threshold;
  - improvements since baseline removed the high-signal categories.
- Wording example:

```md
Stop recommendation: yes
Reason: no defensive entries remain; highest score is low; remaining paths are local scalar helpers or cohesive shared layout reads.
Next useful work would require broader chart architecture changes, not local cleanup.
```

Verification:

- Final chart-bar style reports recommend stopping.
- A report with remaining impossible defenses or overpacked bags does not recommend stopping.
- Stop output is absent or explicitly `no` when no baseline exists and high-severity items remain.

## Separate Suggestion List

1. **Make the defensive ledger more explanatory.**
   Show the exact type reason for `impossible`, such as `series.values: number[]` and the relevant compiler option caveat for indexed access.

2. **Rename first cuts away from `model`.**
   Change `extract geometry model` to `extract render item geometry` or `extract SVG geometry values`, and change `extract item models` to `extract rendered items`.

3. **Add grouped recommendations by rendered thing.**
   Emit `Extract bar rectangles`, `Extract axis ticks`, `Extract path labels`, or similar group names when multiple sinks share one render loop and source path.

4. **Evidence-gate provider/context wording.**
   Provider/context advice should be impossible without provider, context, hook-root, or cross-component relay evidence.

5. **Add a "do not act" classification.**
   Classify small, clear scalar helpers and healthy shared layout reads as already readable so agents do not turn good code into flatter but worse code.

6. **Show mirror-object risk in the first proposal.**
   When the likely extraction is a singleton object whose fields are read once, tell the user to prefer narrow scalar helpers.

7. **Add compare output for focused cleanup loops.**
   A `tsx-dataflow compare <baseline> <after>` flow would make before/after validation much easier and reduce manual report archaeology.

8. **Separate runtime risk from reviewability burden.**
   Mark findings as `runtime-risk`, `reviewability`, or `taste` so users understand whether the issue is a potential defect, a cleanup opportunity, or a naming/shape concern.

9. **Prefer concrete rendered nouns in generated code sketches.**
   Use JSX tag/component context to suggest `BarRect`, `BarTick`, `pathRef`, `visibleRows`, or `formatBarTitle` instead of `renderValue` and `selectedValue`.

10. **Teach the report when to stop.**
    A successful cleanup should not end with a scary remaining hotspot count. It should say that the remaining findings are low-severity background context when that is true.

## Prioritized Implementation Order

1. Gate provider/context advice.
2. Replace generic naming in `proposedHelperName` and first-cut strings.
3. Group related render-item recommendations.
4. Downrank scalar-helper noise.
5. Respect healthy shared helper boundaries.
6. Add stop signal.
7. Add compare output.
8. Expand docs and examples after behavior stabilizes.

## Non-Goals

- Do not auto-rewrite user code.
- Do not infer project architecture from external docs or code owner files.
- Do not hide raw findings from detailed views; downranking should affect prioritization, not erase evidence.
- Do not treat all SVG geometry as a smell. Chart renderers naturally contain geometry math.
- Do not recommend provider/context for local component cleanup without evidence.

## Files To Touch Later

- `src/core.mjs`
  - `SHAPE_FIRST_CUT`
  - `SHAPE_HEADLINE_FIX`
  - `candidateEditsFor`
  - `isProviderContextCandidate`
  - `featureClusterRows`
  - `computeWorkUnits`
  - `extractionBoundariesFor`
  - `extractionProposalFor`
  - `proposedHelperName`
  - ranking/scoring helpers for scalar-helper and healthy-boundary downranking
- `test/core.test.mjs`
  - chart renderer fixture for grouped bar rectangle recommendations
  - provider/context false-positive fixture
  - mirror singleton fixture
  - scalar-helper downranking fixture
  - healthy shared helper fixture
  - compare/stop-signal fixtures when those features are added
- `README.md`
  - document grouped recommendations, compare flow, and stop signal
- `docs/analyzer.md`
  - document the new classification gates and scoring rationale

## Done Conditions

- A chart renderer with no provider/context evidence receives local render-data guidance, not provider/context audit.
- Repeated rectangle/tick sinks produce grouped recommendations with concrete rendered-thing names.
- Generated proposal names avoid banned generic identifiers and avoid `Model` unless local code context justifies it.
- Mirror singleton extraction is warned against before a rerun.
- Small scalar helpers and healthy shared layout helpers no longer dominate top work packets.
- A focused before/after comparison clearly reports improvement and tells the user whether to stop.
