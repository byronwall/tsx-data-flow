# MergeProps Default Boundary Diagnostics Roadmap

Date: 2026-06-23

## Purpose

This document reviews the cleanup report at `/Users/byronwall/repos/modeler.worktrees/dev-refactor-with-tsx-dataflow-guiding/tmp/20260623-tsx-dataflow-cleanup-report.md` and turns the feedback into concrete `tsx-dataflow` reporting improvements.

The important new lesson is that, for Solid components, optional prop defaults often have a good canonical shape: use `mergeProps` once near the component boundary, then let the render path read a certain local props object. Reports should promote that pattern when it fits, while still warning against stale downstream fallbacks and helper-boundary gymnastics.

## Short Diagnosis

`tsx-dataflow` did useful work in the cleanup loop. It pointed at repeated fallback/defaulting and render-path plumbing in a small presentational slice, and the final cleanup measurably improved the scoped report. The strongest result was not another helper extraction. It was a better boundary: default optional Solid props with `mergeProps`, then remove repeated `props.foo ?? default` reads from JSX and SVG calculations.

The tool already has several good guardrails: SVG shell values are separated from repeated item geometry, local scalar geometry can be classified as a local variable problem, background findings avoid over-editing healthy helpers, and the defensive ledger has an action column. The gap is that defaulting guidance is still mostly generic. It says to resolve defaults at a boundary, but it does not clearly say: in Solid component props, prefer `mergeProps` for default props when that preserves reactivity and turns repeated optional reads into a single certain boundary.

## Work And Problems From The Report

### What The Cleanup Did

The cleanup selected a smaller local-defaults chunk instead of larger provider/context and render-item clusters. It changed four presentational components:

- `circular-progress.tsx`: introduced a `mergeProps` default boundary for `size` and `strokeWidth`, then removed the remaining downstream `props.size ?? 32` fallback.
- `avatar.tsx`: introduced local defaults for `label` and `variant`, so JSX reads certain local values directly.
- `user-avatar.tsx`: defaulted tooltip placement while preserving `tooltipContent ?? user.displayName`, because that fallback represents a real optional-prop choice.
- `code-tooltip.tsx`: defaulted `label`, `lang`, `dialect`, and `placement`, while preserving the `positioning` fallback because callers can provide either a full positioning object or a placement.

The scoped circular-progress comparison improved sharply: worst score dropped from `0.80 MEDIUM` to `0.27 LOW`, hotspots dropped from `4026` to `13`, defensive entries dropped from `12` to `0`, and wrappers dropped from `40` to `6`.

### What Worked

- The analyzer identified repeated local defaulting as real render-path burden.
- The cleanup loop used before/after reports effectively and trusted the scoped comparison over a misleading repo-wide compare summary.
- `mergeProps` was a better Solid-specific fix than removing defaults or hiding them inside helper arguments.
- The final code preserved meaningful optional behavior where the fallback still represented a caller choice.
- The analyzer and report helped reject a bad `ButtonNew` experiment when the attempted default-boundary shape widened relay/junction evidence around `isIconOnly()`.
- The stop signal was useful: after the targeted local-default cleanup, the next valuable work was larger ownership/render-item clusters, not more optional-prop polishing.

### What Was Off

- Candidate edits still say `resolve defaults and normalization at a named boundary`, but they do not promote `mergeProps` as the first-class Solid prop default boundary.
- Defensive diagnostics distinguish `impossible`, `possible`, and `unknown`, but they do not explain the preferred action by source shape: optional component props, parser/runtime uncertainty, stale downstream fallback, or mutually exclusive caller APIs.
- Work packets can make valid optional fallbacks feel suspicious because any fallback on the path contributes defensive weight.
- Reports do not explicitly separate `boundary default` from `repeated downstream fallback`, even though the cleanup outcome depended on that distinction.
- Candidate edits warn not to move fallbacks into helper arguments, but they do not provide a positive Solid alternative such as `const local = mergeProps(defaults, props)`.
- Compare output caught metric improvement, but it did not explain why the resulting `mergeProps` shape was better than a helper function or ad hoc local `??` values.
- The current tool cannot easily say that a fallback should stay because the API intentionally accepts either `positioning` or `placement`.

## Ratings

| Dimension                                | Score | Why                                                                                                                                      | Target |
| ---------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Target selection                         |     8 | The tool surfaced a real local cleanup slice and the larger architecture candidates were visible without forcing them into this pass.    |     10 |
| SolidJS default-boundary guidance        |     5 | The final solution used the right Solid idiom, but the report language did not explicitly teach or promote `mergeProps`.                 |     10 |
| Defensive fallback classification        |     7 | Type-impossible and origin/action signals exist, but optional-prop defaults need stronger boundary vs. downstream-repeat labeling.       |     10 |
| Candidate edit specificity               |     6 | Suggestions are much safer than earlier generic extraction advice, but `domain-normalization` still lacks framework-specific next steps. |     10 |
| Preservation of valid optional behavior  |     7 | The cleanup correctly kept real fallbacks, but the analyzer did not make that keep/remove distinction obvious enough.                    |     10 |
| Cleanup-loop verification                |     8 | Scoped before/after comparison was highly useful; repo-wide compare caveats show comparison reporting still needs consistency fixes.     |     10 |
| Noise control after the local fix        |     8 | Background and stop signals helped avoid continuing into low-value polishing.                                                            |     10 |
| Regression detection for bad experiments |     8 | The `ButtonNew` attempt was rejected because the rerun showed worse relay/junction evidence.                                             |     10 |
| Report trustworthiness                   |     7 | Scoped reports were reliable, but max-items-limited compare summaries can still report confusing global wrapper/defensive counts.        |     10 |
| Agent-proofing                           |     6 | A careful agent found the `mergeProps` pattern, but the tool should make that answer obvious without relying on source-inspection taste. |     10 |
| Overall tsx-dataflow performance         |     7 | Useful evidence and a good final cleanup, with one important Solid-specific diagnostic pattern still missing from the report vocabulary. |     10 |

## Plan To Get Closer To 10

### Milestone 1: Add Solid Prop Default Boundary Diagnostics

Customer-visible outcome: when optional component props are repeatedly defaulted on render paths, reports recommend the Solid `mergeProps` boundary directly.

Implementation changes:

- Detect repeated `props.foo ?? default` or `props.foo || default` paths in Solid component bodies where `foo` is optional in the component props type.
- Add a path/defaulting classification such as `solid-prop-default-boundary` or a defensive origin such as `optional-prop default`.
- In `candidateEditsFor`, specialize `domain-normalization` advice for this shape: `Use mergeProps(defaults, props) once near the component boundary, then read local.foo in JSX.`
- Prefer the local name already used by the file (`local`, `mergedProps`, `propsWithDefaults`) and avoid inventing analyzer-ish names.
- Only recommend `mergeProps` for component props/defaults; do not use it for parser payloads, resource data, context values, or arbitrary local objects.

Verification:

- A Solid fixture with repeated `props.size ?? 32` and `props.strokeWidth ?? 4` reports `mergeProps` as the first candidate edit.
- The same fixture no longer frames the defaults as removable stale defenses when the props type is optional.
- A parser/runtime payload fallback fixture still recommends a parser/model normalization boundary, not `mergeProps`.

### Milestone 2: Split Boundary Defaults From Downstream Repeated Fallbacks

Customer-visible outcome: the defensive ledger and work packets say whether a fallback should be kept, moved to a default boundary, removed, or inspected.

Implementation changes:

- Classify defensive records into practical actions: `remove stale defense`, `promote to mergeProps default`, `keep certainty boundary`, `keep API-choice fallback`, and `inspect runtime shape`.
- Count repeated downstream uses of the same optional prop fallback separately from a single boundary fallback.
- Reduce defensive-path weight after a default boundary produces a non-nullish local alias that downstream JSX reads.
- Add report wording that repeated leaf fallbacks are the smell, not a single boundary default.
- Preserve `impossible` as the strongest signal: a fallback on a non-nullish checked type should still recommend removal after a runtime-contract check.

Verification:

- Repeated `props.label ?? "?"` across multiple JSX sinks recommends one default boundary.
- A single `tooltipContent ?? user.displayName`-style API-choice fallback says to keep the fallback because it expresses caller precedence.
- A fallback on a required `label: string` still reports type-impossible removal advice.

### Milestone 3: Tighten Candidate Edits Around Code Fixes

Customer-visible outcome: suggested fixes are safe to follow literally and choose the smallest idiomatic Solid code shape.

Implementation changes:

- Update `domain-normalization` candidate edits to use a decision tree:
  - optional component props: `mergeProps` boundary;
  - parser/runtime payload: parser/model normalization;
  - repeated local scalar math: named local/accessor;
  - type-impossible guard: remove after contract check;
  - caller-choice fallback: keep near the API decision.
- Add negative guidance: do not move valid prop defaults into helper arguments merely to reduce path depth.
- Add positive examples in report prose, such as `const local = mergeProps({ size: 32, strokeWidth: 4 }, props);`.
- Keep the existing guardrails for SVG shell scalars, local scalar geometry, and cohesive repeated render items.
- Review every code-fix phrase in `work-packets`, `repair-map`, `hotspots`, `defensive-ledger`, and compare output so they use the same vocabulary.

Verification:

- Snapshot tests assert that candidate edits contain `mergeProps` for optional Solid props.
- Snapshot tests assert that shell/scalar fixtures do not propose helper functions.
- Snapshot tests assert that parser-boundary and API-choice fallback fixtures do not mention `mergeProps`.

### Milestone 4: Make Compare Mode More Trustworthy For Cleanup Loops

Customer-visible outcome: before/after comparisons explain the net result consistently, even when the baseline directory was generated with display caps.

Implementation changes:

- Separate displayed-row deltas from full-run internal counts in compare output.
- Label capped comparisons explicitly when a prior `--view all` directory omitted rows due to `--max-items`.
- Include a net verdict: `keep`, `revise shape`, `stop`, or `needs broader architecture work`.
- Add a positive verdict reason for successful default-boundary cleanups: repeated downstream fallbacks removed, default boundary remains, wrapper count did not grow.
- Add a suspicious-win warning when worst score drops only because logic moved into helper arguments while wrappers/helper count increased.

Verification:

- A capped baseline comparison says which counts are exact and which are display-limited.
- The circular-progress default-boundary fixture reports a `keep` verdict.
- A helper-argument fallback relocation fixture reports `revise shape`.

### Milestone 5: Promote Stop Signals After Default Cleanup

Customer-visible outcome: after optional prop defaults have been centralized and no stale defenses remain, reports clearly say to stop local polishing unless a larger architecture cluster is selected.

Implementation changes:

- Treat remaining valid optional-prop/API-choice fallbacks as stop evidence when the worst score is low and wrapper count is stable.
- In `Stop Recommendation`, mention when the next useful work is a larger provider/context or render-item cluster rather than more default cleanup.
- In `Background Findings`, add a reason for valid default/API fallbacks: `expresses caller precedence` or `establishes local certainty`.
- Avoid surfacing single optional compatibility fallbacks as quick wins.

Verification:

- After a `mergeProps` cleanup, the same fixture shows a stop recommendation when only API-choice fallbacks remain.
- A real provider/context relay cluster remains visible as a separate broader candidate.
- Quick-win mode does not put valid one-off optional fallbacks ahead of stale defenses.

### Milestone 6: Update Docs And Skill Guidance

Customer-visible outcome: the analyzer docs, examples, and agent skill all describe the same Solid default-boundary pattern.

Implementation changes:

- Add a `mergeProps` section to the analyzer docs under fallback/defaulting guidance.
- Update the agent skill to say: for optional Solid component props, prefer `mergeProps` once at the component boundary before editing render paths.
- Add a short example to the README or example reports showing before/after optional prop defaults.
- Keep the guidance scoped: `mergeProps` is for Solid prop defaults, not a universal normalization tool.

Verification:

- Docs include one positive `mergeProps` example and at least one non-goal example where `mergeProps` is not appropriate.
- The skill's cleanup loop asks whether repeated fallbacks are optional component props before suggesting helper extraction.
- Example reports generated from fixtures contain the same vocabulary as the docs.

## Suggestions From This Feedback

1. Promote `mergeProps` as the preferred SolidJS pattern for optional component prop defaults when repeated render-path fallbacks are the problem.
2. Add a `solid-prop-default-boundary` classification or defensive origin so work packets can distinguish component prop defaults from parser/runtime fallback logic.
3. Change `domain-normalization` candidate edits from generic boundary wording to a decision tree with explicit `mergeProps`, parser-boundary, local-scalar, type-impossible, and API-choice branches.
4. Add a defensive-ledger action for repeated optional prop fallbacks: `promote to mergeProps default`.
5. Add an action for one-off API-choice fallbacks: `keep caller-precedence fallback`, covering cases like `tooltipContent ?? user.displayName` or `positioning ?? placement-derived positioning`.
6. Reduce downstream defensive weight after a valid default boundary produces a certain local props object.
7. Add compare-mode readability/regression checks that catch metric wins caused by moving valid fallbacks into helper arguments.
8. Make capped compare reports honest about which counts came from displayed rows and which came from a full current run.
9. Add regression fixtures for `CircularProgress`, `Avatar`, `UserAvatar`, and `CodeTooltip` default-boundary patterns.
10. Update the skill and docs so agents are told plainly: repeated optional Solid prop defaults are usually a `mergeProps` cleanup, not a helper extraction.

## Suggested Implementation Order

1. Add fixture coverage for optional Solid prop defaults and API-choice fallbacks.
2. Add defensive-origin classification for optional component props and repeated downstream defaulting.
3. Update `candidateEditsFor` and `defensiveActionFor` to emit `mergeProps` guidance for the new classification.
4. Adjust burden scoring so a valid default boundary does not poison downstream scalar/render paths.
5. Improve compare mode count labeling and add the net verdict for default-boundary cleanups.
6. Update `docs/analyzer.md`, `README.md`, and `skills/render-path-dataflow-work/SKILL.md` once the output snapshots lock the new vocabulary.

## Non-Goals And Slice Guards

- Do not recommend `mergeProps` for non-prop data, parser payloads, resources, context models, or arbitrary local normalization.
- Do not remove valid fallback detection; make the action more precise.
- Do not classify all optional prop fallbacks as good. Repeated leaf fallbacks should still be promoted into one boundary.
- Do not hide type-impossible defenses behind `mergeProps`; required non-nullish types should still lead to removal advice.
- Do not prefer helper functions or helper argument defaults just because they lower path depth.
- Do not rewrite user code automatically. These are diagnostics and reporting improvements.

## Bottom Line

`tsx-dataflow` did well enough to guide a real cleanup, but the final solution revealed a missing piece of Solid-specific taste. The tool should learn that repeated optional prop defaults in Solid components are often best fixed by one `mergeProps` boundary, followed by direct reads from the certain local props object.

That guidance would make reports more actionable, reduce over-extraction pressure, preserve meaningful optional API behavior, and turn the strongest lesson from this cleanup into a repeatable diagnostic pattern.
