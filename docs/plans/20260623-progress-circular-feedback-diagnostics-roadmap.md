# Progress Circular Feedback Diagnostics Roadmap

Date: 2026-06-23

## Purpose

This document reviews the progress circular cleanup report from `/Users/byronwall/repos/modeler/tmp/data-flow/20260623-progress-tsx-dataflow-cleanup-report.md`, explains why `viewBox` became a helper function, rates how `tsx-dataflow` performed, and proposes tool/reporting improvements to move the analyzer closer to consistently excellent cleanup guidance.

## Short Diagnosis

The final code change improved analyzer metrics, but it still exposed a guidance gap. Extracting repeated circle render data into `CircularProgressCircle[]` was a good direction. Extracting `viewBox` into `circularProgressViewBox(...)` was not the ideal local code shape.

`viewBox` is root SVG shell sizing. It is not a repeated rendered item field and it is not a meaningful boundary by itself. The better default is a simple inline expression such as ``viewBox={`0 0 ${size} ${size}`}``, or, if the render block gets noisy, a tiny local thunk or memo immediately above the JSX. A separate helper function only makes sense when several render surfaces share the same typed sizing contract.

## Why `viewBox` Was Forced Into A Function

The report does not show a direct tool command saying "extract `viewBox` into a separate helper." The odd function appears to be an agent interpretation of several signals that, together, pushed too hard toward extraction:

1. The first attempted render object bundled `viewBox`, `track`, and `indicator`. It reduced worst score but created a relay-bag/wrapper spike.
2. The report correctly said root SVG sizing should stay separate from repeated circle items.
3. Existing tool guidance emphasized extracted boundaries and generated helper-style proposals for deep paths.
4. The skill guidance did not explicitly say that root shell attributes should stay inline or in a tiny local thunk.
5. The agent split `viewBox` away from the item array, but chose a standalone helper function instead of a simpler local calculation.

So the root cause was partly analyzer/report guidance and partly agent over-application. The tool had enough shape vocabulary to separate `viewBox` from circle geometry, but not enough diagnostic force to say: this is a shell scalar; do not make it a helper just to satisfy the data-flow report.

## Work And Problems From The Report

### What Worked

- Focused per-file runs prevented broad, low-confidence edits in the conversation inspector files.
- Before/after reruns caught bad edits and led to reverting them.
- The analyzer correctly disliked the broad singleton render object after the first progress edit.
- The final item-shaped extraction lowered the worst score, max depth, wrappers, and defensive ledger entries.
- Stop signals were useful: optional prop fallbacks, shallow scalar gates, and low worst scores were treated as reasons to stop.

### What Was Off

- The `viewBox` helper was too much ceremony for a local root SVG scalar.
- The tool still made it too easy to convert "separate root value from repeated item data" into "extract root value into a function."
- Fallback guidance was still too generic. Some fallbacks are exactly the right way to turn optional or external uncertainty into certainty.
- Moving fallbacks into helper arguments can make code look flatter to the analyzer while making ownership and readability worse.
- Optional-prop fallbacks continued to show up as suspicious until source inspection proved them valid.
- Conversation-file findings were often true but not actionable because loose payload/entity types created real uncertainty.

## Ratings

| Dimension                         | Score | Why                                                                                                                                | Target |
| --------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------- | -----: |
| Broad target triage               |     7 | The tool surfaced hot areas, but high-burden conversation files required substantial human stop-signal judgment.                   |     10 |
| Focused cleanup loop support      |     8 | Baseline, rerun, and compare habits prevented bad edits from surviving.                                                            |     10 |
| Repeated render-item grouping     |     8 | The successful `CircularProgressCircle[]` shape matched the intended item extraction pattern.                                      |     10 |
| Root SVG shell diagnostics        |     4 | `viewBox` was separated from items, but the reporting did not clearly discourage a standalone helper.                              |     10 |
| Fix suggestion specificity        |     6 | Advice improved over older generic names, but still over-favored function extraction for shell/scalar paths.                       |     10 |
| Fallback classification           |     6 | Type-impossible and parser-boundary signals exist, but optional-prop and certainty-making fallbacks need clearer report language.  |     10 |
| Wrapper/regression detection      |     9 | The relay-bag/wrapper spike was detected and corrected.                                                                            |     10 |
| Stop-signal quality               |     8 | The report documented why several files should not be edited. It could make these stop reasons more prominent in generated output. |     10 |
| Scalar-helper noise control       |     7 | The tool can downrank harmless helpers, but similar local shell scalars still needed stronger classification.                      |     10 |
| Agent-proofing of candidate edits |     5 | A capable agent still made a too-clever helper, which means suggestions were not constrained enough.                               |     10 |
| Overall tsx-dataflow performance  |     7 | It produced useful evidence and a net-positive cleanup, but still needed human correction to avoid code-shape theater.             |     10 |

## Plan To Get Closer To 10

### Milestone 1: Treat SVG Shell Attributes As First-Class Scalars

Customer-visible outcome: work packets for `viewBox`, root `width`, and root `height` explicitly say these are shell sizing values, not repeated rendered item fields.

Implementation changes:

- Add a `svg-shell` path shape before generic geometry classification.
- Exclude shell attributes from render-item extraction proposals.
- Show an `Extraction shape check` verdict such as `root shell scalar`.
- Candidate edits should recommend inline expressions or tiny local thunks above JSX.
- Only recommend a reusable helper when several render surfaces share one typed sizing boundary.

Verification:

- A circular-progress fixture with `viewBox={viewBox}` reports `verdict: root shell scalar`.
- The work packet does not include `proposed: function computeViewBox...`.
- Repeated `circle`/`rect` geometry still groups as rendered items.

### Milestone 2: Tighten Fallback Guidance Around Certainty Boundaries

Customer-visible outcome: reports distinguish stale fallbacks from fallbacks that create a real downstream invariant.

Implementation changes:

- Candidate edits should say fallbacks are valid when they convert optional, unknown, external, parser, or runtime-derived values into certainty.
- Warn against moving a valid fallback into helper arguments just to reduce path depth.
- Defensive ledger rows should keep showing origin, but work packets should echo the practical action: remove, keep, or inspect.
- Optional local props should read as compatibility/optional unless type evidence proves otherwise.

Verification:

- Optional prop fallback fixtures do not produce removal advice.
- Type-impossible fallback fixtures still recommend removal after runtime-contract confirmation.
- Parser-boundary indexed extraction fixtures remain non-impossible.

### Milestone 3: Make Candidate Edits Safer To Copy

Customer-visible outcome: an agent can follow candidate edits literally without producing awkward helper boundaries.

Implementation changes:

- Add negative guidance where over-extraction is likely: no singleton render objects, no helper for a single root scalar, no broad `ready` bags.
- Separate edit suggestions by render family: shell, geometry, style, identity, text, control-flow, normalization.
- Include "prefer inline" language for simple scalar calculations.
- Put "rerun and inspect wrapper count" directly in recommendations for extraction work.

Verification:

- Snapshot tests for `svg-shell`, `geometry-chain`, `control-flow-gate`, and `domain-normalization` candidate edits.
- No banned generic names or helper-only suggestions appear for shell values.

### Milestone 4: Promote Stop Signals In Reports

Customer-visible outcome: when the best action is to stop, the report makes that obvious before an agent starts editing.

Implementation changes:

- In `work-packets`, elevate stop reasons when remaining findings are optional-prop fallbacks, shallow scalar helpers, healthy shared boundaries, or low-confidence unknown payload guards.
- Add a "Why not edit this" sentence to background findings where source inspection is likely required.
- In compare output, call out when metrics improved but a secondary metric regressed, such as wrapper count.

Verification:

- Conversation-style fixtures with unknown entity payloads report investigation/stop guidance instead of code edits.
- A cleanup that improves worst score but regresses wrappers clearly says not to stop at that shape.

### Milestone 5: Improve Before/After Review UX

Customer-visible outcome: cleanup reports explain whether the code got better overall, not just whether one score dropped.

Implementation changes:

- Compare mode should summarize worst score, hotspot count, max depth, wrappers, defensive entries, and new top findings in one table.
- Add a "net verdict" that distinguishes `keep`, `revise shape`, `revert`, and `stop`.
- Flag cases where a broad singleton object lowers depth but increases wrapper/relay risk.

Verification:

- A broad render-object fixture gets `revise shape` rather than `keep`.
- A cohesive repeated-item extraction gets `keep`.
- A scalar-helper-only cleanup gets `stop`.

## Suggestions From This Feedback

1. Add a `svg-shell` diagnostic family with root-shell wording for `viewBox`, root `width`, and root `height`.
2. Suppress standalone extraction proposals for shell attributes unless cross-surface reuse proves a real boundary.
3. Keep repeated item extraction focused on arrays or cohesive item records such as `CircularProgressCircle[]`, `BarRectangle[]`, or visible rows.
4. Add candidate edit language that says valid fallbacks should stay close to the uncertainty they resolve.
5. Make defensive-ledger origin actionable in work packets: stale fallback, optional compatibility, parser-boundary fallback, or review needed.
6. Add a compare-mode warning when one metric improves but wrapper count or relay-bag risk spikes.
7. Put stop-signal reasons earlier in reports so agents do not start low-value edits in noisy files.
8. Add regression fixtures based on `circular-progress.tsx`: broad singleton render object, final item array, and shell scalar `viewBox`.
9. Keep skill guidance aligned with analyzer output so agent instructions and report diagnostics say the same thing.
10. Treat "agent-proofing" as a reporting quality dimension: suggestions should be safe when copied by a well-meaning agent under time pressure.

## Current Code/Skill Follow-Up

This feedback has been incorporated into the repo in two ways:

- `src/core.mjs` now classifies SVG shell attributes as `svg-shell`, emits a `root shell scalar` shape check, and suppresses helper extraction proposals for those sinks.
- `skills/render-path-dataflow-work/SKILL.md` now tells agents to keep shell sizing inline or as a tiny local thunk and to preserve fallbacks that truly establish certainty.
