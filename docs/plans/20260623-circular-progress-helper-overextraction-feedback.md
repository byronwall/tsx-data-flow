# Circular Progress Helper Over-Extraction Feedback

Date: 2026-06-23

## Purpose

This document reviews the cleanup report at `/Users/byronwall/repos/modeler/tmp/20260623-circular-progress-tsx-dataflow-cleanup.md`, focusing on why `tsx-dataflow` guidance pushed the implementation toward helper types/functions for `CircularProgress` when the underlying cleanup may have been much smaller.

The goal is to tighten the analyzer's diagnostics and reporting so candidate edits steer agents toward the smallest readable fix: remove stale defenses, name real certainty boundaries, group cohesive repeated items only when that shape genuinely exists, and prefer local scalar variables for repeated scalar math such as `size() / 2`.

## Short Diagnosis

The cleanup report says the component was changed to use two typed boundaries:

- `getCircularCircleGeometry(...)` for shared circle geometry.
- `getCircularProgressDasharrays(...)` for progress and track dash math.

That removed `CircularProgress` from the top hotspot and repair-map queues, but the code shape sounds heavier than the problem. The reported pain was clustered around repeated circle SVG attributes and dasharray math. For two circles in one component, the human-friendly fix is likely closer to:

- default `size` and `strokeWidth` once;
- compute `center = size() / 2` once;
- compute `radius`, circumference, and dash values once;
- keep the valid optional-prop fallbacks where they convert uncertain inputs into certain local values;
- let the JSX read those named locals directly.

A helper function plus exported-looking object shape may make the analyzer path shorter while making the code harder to read. That is the failure mode to fix: the tool should not reward code-shape theater when a couple of local variables express the invariant better.

## Why The Guidance Pushed Toward Helper Types And Functions

The report shows several analyzer signals that were individually reasonable but combined into an over-extraction nudge.

1. `repair-map.md` listed both track and indicator `stroke-dasharray` sinks as central leverage. This correctly identified repeated math, but central leverage was interpreted as an extraction boundary rather than local simplification.
2. `work-packets.md` reported high path depth for the track and indicator dasharray paths. Depth is a useful smell, but in this case much of the depth came from compact scalar geometry and fallbacks, not from cross-component ownership or broad render model churn.
3. `boundary-report.md` called local scalar helpers such as `progressLength()` and `dashLength()` confluence/junction boundaries. That made ordinary math helpers look load-bearing enough to formalize.
4. The grouped recommendation said to extract repeated circular-circle render geometry, while the shape check warned against one broad mirror singleton. That was directionally right but still left too much room for a typed helper boundary rather than local variables.
5. Candidate-edit wording in the current tool still says geometry chains should "extract a createMemo returning a value". For a pair of SVG circles, that can be read as "invent a circle geometry model" even when the best fix is `const center = size() / 2`.
6. The report treated metric disappearance as strong confirmation. `CircularProgress` leaving the top queues proves the analyzer was satisfied; it does not prove the resulting code is the simplest maintainable shape.

The analyzer needs another diagnostic category between `cohesive repeated item` and `mirror singleton risk`: repeated local scalar geometry. That category should say: name the repeated scalar once, maybe keep a tiny memo/accessor if Solid reactivity requires it, but do not create a helper type/function unless there are multiple rendered items or multiple call sites consuming the same cohesive shape.

## Fallback Diagnosis

The feedback also points to a fallback-classification gap.

Fallbacks are not inherently debt. A fallback is good when it converts an optional, unknown, parser-derived, external, or runtime-derived value into a certain local value that downstream render code can trust. In `CircularProgress`, optional props such as size, stroke width, value, or max may legitimately need defaulting near the component boundary.

The suspicious pattern is different: repeated fallbacks downstream after certainty has already been established, or fallbacks moved into helper arguments just to shorten a traced path. That can poison downstream chains in the report because the path starts with a real fallback, then every subsequent derived value inherits defensive-path weight even though the fallback has already done its job.

The tool should distinguish these cases:

| Fallback shape                                          | Report classification         | Preferred action                                                      |
| ------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| Optional prop defaulted once into a local certain value | certainty boundary            | Keep it; name the local value clearly.                                |
| Parser/runtime extraction defaulted once                | normalization boundary        | Keep it at the parser/model boundary.                                 |
| Same fallback repeated at multiple SVG attributes       | repeated normalization        | Compute the certain value once, then read it.                         |
| Fallback on a non-nullish checked type                  | stale/type-impossible defense | Remove after confirming the type is the runtime contract.             |
| Valid fallback moved into helper args                   | over-shaped cleanup           | Prefer the explicit boundary local; do not contort helper signatures. |

## What Worked

- The analyzer found the correct region: `CircularProgress` had repeated SVG render-path work worth inspecting.
- Before/after report bundles made the cleanup measurable.
- The broad singleton warning prevented one large mirror object from becoming the final shape.
- The report recognized that remaining circular-progress signal was concentrated in dash math rather than component ownership.
- The stop recommendation moved attention away from `CircularProgress` after the major metric signal disappeared.

## What Was Off

- The guidance over-valued helper boundaries for local math.
- The tool did not say "this is just repeated scalar geometry; prefer locals" loudly enough.
- A pair of circles was treated too much like a repeated render-item collection.
- Helper-boundary labels such as confluence/junction made `progressLength()` and `dashLength()` sound more architectural than they are.
- Candidate edits still made function/memo extraction feel like the normal geometry-chain answer.
- The success metric emphasized queue disappearance rather than readability of the resulting code.
- Fallback language did not clearly separate certainty-making defaults from stale downstream defenses.

## Ratings

| Dimension                        | Score | Why                                                                                                                         | Target |
| -------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------- | -----: |
| Target selection                 |     8 | The analyzer found a real local hotspot and did not wander into unrelated files.                                            |     10 |
| Problem sizing                   |     5 | It treated repeated scalar math as a larger boundary/extraction problem than it likely was.                                 |     10 |
| Repeated SVG geometry guidance   |     5 | It recognized repeated circle attributes, but did not distinguish two-circle scalar reuse from true repeated item modeling. |     10 |
| Helper-boundary judgment         |     4 | Local math helpers were framed as boundaries/junctions, encouraging more abstraction instead of less.                       |     10 |
| Fallback classification          |     5 | Type-impossible fallback concepts exist, but certainty-making fallbacks still add too much suspicious downstream weight.    |     10 |
| Candidate edit specificity       |     5 | Suggestions were directionally useful but too extraction-oriented for local geometry.                                       |     10 |
| Mirror singleton detection       |     7 | The tool warned against broad singleton packing, but did not provide the smaller alternative strongly enough.               |     10 |
| Stop-signal quality              |     7 | It eventually stopped local cleanup, but after an arguably over-shaped final code form was accepted.                        |     10 |
| Compare/report validation        |     7 | Before/after reports showed metric improvement, but not whether the code became easier to read.                             |     10 |
| Agent-proofing                   |     4 | A well-meaning agent could follow the output and produce helper types/functions where locals would be clearer.              |     10 |
| Overall tsx-dataflow performance |     6 | Useful evidence, wrong pressure. It found the smell but oversold the abstraction needed to fix it.                          |     10 |

## Plan To Get Closer To 10

### Milestone 1: Add A Repeated Scalar Geometry Classification

Customer-visible outcome: reports identify cases where the right fix is one or two named local scalar values, not a helper function or render model.

Implementation changes:

- Add a path shape such as `local-scalar-geometry` for repeated arithmetic feeding same-family SVG attributes in one component.
- Detect repeated subexpressions such as `size() / 2`, `(size() - strokeWidth()) / 2`, circumference math, and local dash calculations.
- Emit an extraction shape verdict such as `repeated scalar; prefer local variable`.
- Suppress function-style extraction proposals for this verdict.
- Candidate edits should say to compute `center`, `radius`, `circumference`, or `dashOffset` once near the JSX.

Verification:

- A `CircularProgress` fixture with two circles using `size() / 2` reports `repeated scalar; prefer local variable`.
- The report does not propose `function getCircularCircleGeometry(...)` for only two local circles.
- A true repeated collection such as mapped ticks or bars still reports `cohesive repeated item`.

### Milestone 2: Make Helper Boundary Reports Less Dramatic For Local Math

Customer-visible outcome: `boundary-report` stops making small scalar helpers sound like architecture work.

Implementation changes:

- Add a helper verdict such as `local scalar math` or `readable scalar helper` when a helper has narrow primitive inputs/output, low caller count, no object packing, and no stale defenses.
- Move these helpers to background findings unless they are repeated across files or hide impossible defenses.
- Change boundary notes for this class to "leave it or inline into a nearby local" rather than "formalize boundary".
- Do not count same-component scalar helpers as confluence/junctions unless they merge several independent domain sources and re-spread to multiple consumers.

Verification:

- `progressLength()` and `dashLength()` style fixtures do not appear in central leverage queues by default.
- A real multi-caller normalization helper still appears in `boundary-report`.

### Milestone 3: Tighten Geometry Candidate Edits

Customer-visible outcome: geometry recommendations name the smallest appropriate code shape.

Implementation changes:

- Split `geometry-chain` candidate edits by cardinality:
  - single root shell scalar: inline or tiny local thunk;
  - one component, two to three repeated scalar attributes: local variables/accessors;
  - repeated mapped items: array of cohesive item records;
  - shared cross-component geometry: typed helper boundary.
- Replace generic "extract a createMemo returning a value" with conditional advice based on this split.
- Include a negative line: "Do not introduce a helper type/function solely to avoid repeating `size() / 2`."
- In extraction proposals, show `no helper proposal` with the reason when the classification is scalar-local.

Verification:

- Snapshot output for circular progress recommends `center`/`radius` locals.
- Chart bar/tick fixtures still recommend `BarRectangle[]` or `BarTick[]` when fields are consumed as repeated items.

### Milestone 4: Promote Certainty-Making Fallbacks

Customer-visible outcome: reports stop treating downstream chains as suspicious just because they start with a legitimate fallback.

Implementation changes:

- Classify fallback records as `certainty boundary`, `repeated downstream fallback`, `type-impossible fallback`, or `review needed`.
- Once a fallback produces a local alias with a non-nullish type, reduce defensive weight for downstream arithmetic that uses that alias.
- Candidate edits should preserve valid boundary fallbacks and remove only stale downstream fallbacks.
- Add wording that fallbacks should stay close to the uncertainty they resolve, not be moved into helper arguments for analyzer cleanliness.

Verification:

- Optional prop default fixtures keep the fallback and do not receive removal advice.
- Repeated fallback-at-sink fixtures recommend computing the certain local once.
- Type-impossible fallback fixtures still recommend removal.

### Milestone 5: Add Readability Regression Checks To Compare Output

Customer-visible outcome: compare reports can say "metrics improved, but the shape got heavier".

Implementation changes:

- Track newly introduced helper functions, exported/local types, object packs, and wrapper counts in compare mode.
- Add a net verdict: `keep`, `simplify shape`, `revise extraction`, or `stop`.
- Flag metric wins where helper count or wrapper count rises without a cohesive repeated item, normalization boundary, or shared cross-component use.
- Show a short "human review prompt" for suspicious wins: "Could this be two named locals instead?"

Verification:

- A before/after that replaces repeated `size() / 2` with a helper type/function gets `simplify shape`.
- A before/after that extracts mapped rows/items gets `keep`.

### Milestone 6: Update Skill Guidance To Match The Tool

Customer-visible outcome: agents using the skill choose the same small fix the report recommends.

Implementation changes:

- Add explicit guidance: repeated local SVG scalar math should become local variables/accessors, not helper functions, unless shared outside the render block.
- Say that `size() / 2` repeated across two circles is a local readability issue, not a render model by default.
- Keep the existing shell-scalar and fallback-boundary guidance.
- Add a spot-check question before extraction: "Are multiple fields consumed together as one repeated item, or am I just naming scalar math?"

Verification:

- The skill's `Spot-Check Rules` mention scalar-local geometry.
- The skill's default work mode tells agents to avoid formal helper boundaries for tiny local math.

## Suggestions From This Feedback

1. Add `local-scalar-geometry` as a first-class path shape.
2. Add an extraction shape verdict: `repeated scalar; prefer local variable`.
3. Suppress helper-function proposals for repeated `size() / 2`-style expressions in one component.
4. Split geometry candidate edits by cardinality: shell scalar, local scalar reuse, repeated item array, shared typed boundary.
5. Downrank same-component scalar math helpers in `boundary-report` and `repair-map`.
6. Reclassify valid optional-prop fallbacks as certainty boundaries so downstream chains are not poisoned by a good fallback.
7. Warn when an implementation moves a valid fallback into helper arguments just to shorten the analyzer path.
8. Add compare-mode readability checks for new helper functions, helper types, object packs, and wrapper count.
9. Add circular-progress regression fixtures for `center = size() / 2`, radius/circumference math, and track/indicator dasharray reuse.
10. Update the agent skill so it says plainly: if the fix is only avoiding repeated scalar math across two SVG elements, prefer local variables.

## Suggested Implementation Order

1. Implement `local-scalar-geometry` detection and candidate-edit suppression.
2. Add circular-progress fixtures and snapshot assertions for local scalar guidance.
3. Adjust helper-boundary classification for low-risk same-component scalar helpers.
4. Add fallback certainty-boundary labels and downstream defensive-weight reduction.
5. Enhance compare output with readability regression checks.
6. Update `skills/render-path-dataflow-work/SKILL.md` after the report output changes are tested.

## Non-Goals And Slice Guards

- Do not remove valid fallback detection; make it more precise.
- Do not stop recommending cohesive render-item arrays for real repeated collections.
- Do not forbid helper functions for shared geometry used by several render surfaces.
- Do not make the analyzer judge aesthetics globally; limit this to concrete signals such as scalar arithmetic, cardinality, helper count, wrapper count, and consumption shape.
- Do not rewrite user code automatically. These are report and diagnostic improvements.

## Bottom Line

`tsx-dataflow` correctly found a local render-path smell, but its guidance was still biased toward abstraction. For `CircularProgress`, the best cleanup may have been a few certain local values: `size`, `strokeWidth`, `center`, `radius`, circumference, and dash lengths. The tool should learn to say that directly.

The next improvement is not more extraction vocabulary. It is better restraint: distinguish real render models from local scalar reuse, protect certainty-making fallbacks, and make candidate edits safe enough that a diligent agent does not turn two repeated calculations into a miniature API.
