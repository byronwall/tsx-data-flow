# Circular Progress Guidance Diagnostics

Date: 2026-06-23

## Source Feedback

The circular-progress cleanup report at `/Users/byronwall/repos/modeler.worktrees/dev-refactor-with-tsx-dataflow-guiding/tmp/20260623-circular-progress-tsx-dataflow-report.md` describes a useful diagnosis but an over-large implementation result.

The useful part was identifying repeated local SVG scalar geometry in `circular-progress.tsx`: `size() / 2`, radius/circumference math, dasharray values, and optional `size` / `strokeWidth` fallbacks feeding circles.

The bad part was the implementation pressure. The likely best change was only to name a few local scalar values near JSX, especially the center value used by both `cx` and `cy`. Instead, the guidance could be read as permission to build helper shapes, helper functions, and then a `<For>` collection over two circles. That made the component longer and harder to scan for the sake of avoiding a couple of repeated expressions.

## What Went Wrong

The analyzer had enough raw signal to say this was local SVG scalar math, not architecture work. The failure was in report synthesis and agent affordances:

1. The detailed sink advice and the higher-level summaries were not equally conservative. A sink could be shaped as local scalar geometry while a feature or hotspot summary still said to extract render item data.
2. The grouping language treated repeated SVG attributes as if they implied a repeated rendered item. For bars or ticks that is often right. For two fixed circles in one progress component, it is usually not.
3. The tool did not make edit cost visible. It counted path depth, repeated scalar flow, fallbacks, and wrappers, but it did not say that a `<For>` render collection for two hard-coded circles is likely a readability regression.
4. The candidate edits were phrased as cleanup moves, not as a decision tree with negative examples. Agents could follow the positive suggestion and skip the smaller alternative.
5. Stop guidance arrived after the cleanup loop rather than before the implementation choice. The report needed a stronger pre-edit stop signal: local aliases are enough; do not introduce a helper type/function or collection render model unless the code already has repeated item data.

## Fix Applied In This Repo

The report layer now treats local scalar SVG geometry as a first-class summary shape:

- Hotspot first cuts now include `local-scalar-geometry` as `name repeated local scalars`.
- SVG shell first cuts now say `keep shell sizing inline`.
- Feature cluster first cuts are now shape-aware instead of defaulting all non-provider local clusters to `extract render item data`.
- Circular-progress regression coverage now checks both `work-packets` and `hotspots` so the high-level summaries cannot reintroduce render-item pressure while the detailed item says to use local scalars.

This is intentionally a narrow fix. It does not remove render-item extraction guidance for real repeated items such as bar rectangles or axis ticks.

## Scorecard

| Dimension                                          | Score | Why                                                                                                                                                                            |
| -------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Raw detection of repeated render-path work         |     8 | It found the circular-progress SVG scalar paths and fallbacks. The graph was directionally correct.                                                                            |
| Shape classification                               |     7 | It had `local-scalar-geometry`, `svg-shell`, and grouped render recommendations, but summaries could still flatten local scalar work into render-item extraction.              |
| Fix-size judgment                                  |     4 | The produced guidance allowed a line-count-increasing rewrite for a tiny duplication problem. It did not explicitly compare local aliases vs a `<For>`/type/helper extraction. |
| Candidate edit precision                           |     5 | Some edits were good, but the wording could still sound like helper extraction was a normal next step. Negative constraints were not visible everywhere the agent looked.      |
| Stop-signal quality                                |     5 | The report had stop recommendations and background findings, but the stop signal came too late and was weaker than the extraction vocabulary.                                  |
| Report consistency across views                    |     5 | Work-packets, hotspots, feature clusters, grouped recommendations, and repair-map could disagree in tone. This is the main recurring failure mode.                             |
| Agent-readability / implementation ergonomics      |     6 | The reports are rich, but agents need sharper “do this small thing, do not do that bigger thing” guidance when the correct edit is tiny.                                       |
| Regression coverage for guidance quality           |     6 | There were already focused tests for local scalar geometry, fallbacks, and helper boundaries. The missing coverage was top-level summaries nudging a different fix.            |
| Overall performance on this circular-progress case |     5 | The tool surfaced the right area but over-promoted an expensive shape of fix. It helped find the smell but did not keep the implementation proportional.                       |

## Plan To Get Closer To 10/10

### 1. Make Every View Share One Advice Object

Customer-visible outcome: every report view tells the same implementation story for the same finding.

Implementation changes:

- Build a normalized `advice` object per sink during ranking: primary shape, first cut, allowed edits, forbidden edits, stop threshold, and extraction eligibility.
- Render `work-packets`, `hotspots`, `repair-map`, feature clusters, and grouped recommendations from that object instead of re-deriving wording independently.
- Add snapshot-style tests for the same fixture across at least `work-packets`, `hotspots`, and `repair-map`.

Verification:

- A circular-progress fixture never contains both `name repeated local scalars` and `extract render item data` for the same dominant issue.
- Bar/tick fixtures still recommend repeated item extraction.

### 2. Add Proportionality Diagnostics

Customer-visible outcome: reports explain when a fix is likely bigger than the problem.

Implementation changes:

- Add a small `editWeight` heuristic: local alias, remove fallback, inline wrapper, memo extraction, helper function, collection render, context/store move.
- Compare `editWeight` to burden and sink count.
- Emit `proportionality: local alias only` for low-burden, same-component scalar work.
- Emit `avoid: collection render model for fixed sibling elements` when sink count is small and there is no existing array/collection source.

Verification:

- Two fixed circles produce local-alias advice.
- Repeated bars from `values.map` / `<For each>` still produce collection advice.

### 3. Separate Repeated Scalars From Repeated Items

Customer-visible outcome: repeated `size / 2` and repeated `rect x/y/width/height` are not treated as the same smell.

Implementation changes:

- Require collection evidence before recommending an array shape: existing `.map`, `<For each>`, array root, or at least three homogeneous sibling elements with distinct data.
- Treat two fixed SVG siblings as scalar duplication unless they already come from item data.
- Add field-level language: `center`, `radius`, `circumference`, `dasharray`, not `Circle[]`.

Verification:

- Fixed track/indicator circles are not grouped into `Circle[]`.
- Data-driven bars still group into `BarRectangle[]`.

### 4. Strengthen Negative Examples In Candidate Edits

Customer-visible outcome: agents see both the intended edit and the tempting over-edit to avoid.

Implementation changes:

- Add a short `Avoid` line to candidate edits for local scalar geometry, root shell sizing, and control gates.
- For local scalar geometry: avoid helper types, helper functions, and `<For>` solely to remove repeated arithmetic.
- For fallbacks: avoid moving legitimate certainty boundaries into helper arguments.

Verification:

- Local scalar fixture contains the specific forbidden edit language.
- Normalization-boundary fixture does not inherit the scalar-specific warning.

### 5. Move Stop Guidance Before Candidate Edits For Low-Value Local Work

Customer-visible outcome: the report says “this is probably not worth extracting” before listing possible edits.

Implementation changes:

- For background or near-background findings, render `Stop / Minimal Fix` before `Candidate edits`.
- Rename low-value work from `WORK ITEM` to `OBSERVATION` or move it under background when no defensive entries or pack risk exist.
- In compare output, distinguish “improved enough; stop local cleanup” from “continue cleanup elsewhere.”

Verification:

- A circular-progress rerun after local scalar aliases moves remaining shell/defaulting items to background or stop.

### 6. Add Report Consistency Tests For Known Failure Modes

Customer-visible outcome: recurring feedback becomes executable guardrails.

Implementation changes:

- Add fixtures for fixed circles, two fixed lines, data-driven bars, parser boundaries, and broad view packs.
- Assert forbidden phrases per fixture, not only expected phrases.
- Add a small helper in tests that extracts sections from markdown views so tests can target the relevant report area.

Verification:

- The suite fails if a local scalar fixture mentions `For each`, `Circle[]`, `render item data`, or helper types/functions as a candidate fix.

### 7. Add A Human Review Checklist To Reports

Customer-visible outcome: reports ask the reviewer the right proportionality questions before coding.

Implementation changes:

- Add three checkboxes or short bullets under `Review summary`: `Is there existing collection data?`, `Will this reduce line count or branches?`, `Can a local alias solve it?`
- Gate extraction proposals behind affirmative evidence instead of path depth alone.

Verification:

- Local scalar examples show `Can a local alias solve it? yes`.
- Collection examples show the array/For evidence that justifies extraction.

## Useful Suggestions From This Feedback

1. Make summary rows use the same advice classification as detailed work items; inconsistent top-level wording is dangerous.
2. Add an explicit proportionality check for every suggested code fix.
3. Treat two fixed SVG siblings as scalar duplication by default, not as collection rendering.
4. Require collection evidence before suggesting `<For>` or `Thing[]` shapes.
5. Put forbidden edits next to recommended edits for common overreach cases.
6. Downrank local scalar helper churn more aggressively when there are no defensive operations, unknown edges, or pack risks.
7. Add a `minimal fix` section for low-risk local cleanups: “name `center`; optionally name `trackDasharray`; stop.”
8. Make compare reports say whether the next action is local cleanup, broader architecture, or no action.
9. Add report consistency tests across `work-packets`, `hotspots`, and `repair-map` for every recurring feedback case.
10. Keep extraction proposal names and shapes domain-specific, but only render them after extraction eligibility passes.

## Target End State

For the circular-progress case, a 10/10 report would say something close to:

```text
This is local SVG scalar geometry. Minimal fix: define center = size() / 2 near the JSX and reuse it for cx/cy. Keep size/strokeWidth fallbacks as local certainty boundaries. Do not introduce a helper type, helper function, or <For> collection for two fixed circles unless the component becomes data-driven. Stop after the local aliases; remaining root viewBox sizing is fine inline.
```

That is the bar: correct hotspot, proportional fix, explicit non-goals, and a stop signal strong enough that an implementation agent does not inflate the code while trying to satisfy the analyzer.
