# Plan: Change-Oriented Analysis and Regression Review

## Why this feature

`INTENT.md` defines the primary question as: “Did this change make the code
worse?” The repo can scope analysis to supplied files and compare aggregate
reports, but its comparison is still mostly report-level or keyed by a sink's
file plus structural signature. It does not yet treat a code change as a
first-class review object with changed lines, newly introduced operations, and
unchanged downstream consequences.

The transcript adds a useful architectural lens: a small edit may cut through a
vertical feature slice, spread into horizontal support systems, or introduce an
intermediate representation whose cost only appears downstream. The product
should reveal that impact without requiring durable IDs or a full architecture
model.

## Product outcome

Given a base and current source tree—or an explicit changed-file/line manifest—
the overview answers within one minute:

1. What consequential complexity was introduced, removed, or made worse?
2. Which changed expression caused it?
3. How far does it reach into unchanged code?
4. Is this a local cleanup, a cross-component contract issue, or an opaque area
   that needs investigation?

This is a later mode over the whole-project graph. The main result contains only
new or worsened problems attributable to the change. Known pre-existing problems
do not appear in change-review results; they remain available in ordinary
whole-project exploration. Uncertain attribution appears separately as
“possibly related” and never affects the main verdict.

## Input model

Support two inputs behind one internal `ChangeScope`:

```ts
interface ChangeScope {
  base: AnalysisGeneration | null;
  current: AnalysisGeneration;
  files: Array<{
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    changedRanges: Array<{ startLine: number; endLine: number }>;
    previousPath?: string;
  }>;
}
```

Delivery order:

1. accept an explicit JSON change manifest so analysis is independent of Git;
2. add CLI convenience for a Git ref/range by translating `git diff` into that
   manifest;
3. let the local server receive/rebuild the same scope.

Git is an adapter, not an analysis dependency. Analysis should still work in
generated worktrees and non-Git directories.

## Matching strategy

Comparison needs multiple confidence tiers rather than one fragile key:

- **Proven:** same checker symbol within equivalent project structure, or an
  unchanged syntax anchor mapped through the diff.
- **Strong:** same file/renamed file, owning component/function, sink category,
  and normalized expression/path signature.
- **Weak:** file plus structural signature only; eligible only for “possibly
  related,” never the main delta.
- **Unmatched:** introduced or removed.

Store match confidence and reasons. Never present a weak match as a regression.
IDs only need to live for the comparison generation, consistent with
`INTENT.md`.

## Phases

### Phase 1: Change manifest and dual-generation comparison

- Add CLI arguments for a change manifest and base analysis input.
- Analyze current changed files while retaining project-wide type/checker context.
- Analyze or load the base generation using the same analyzer settings.
- Normalize file rename and line mapping information.
- Add strict schemas at the CLI/server boundary.

The first slice may analyze both generations in full for correctness. Optimize
incrementally only after benchmarks identify the expensive stages.

Verification:

- added, modified, deleted, and renamed file fixtures;
- changed ranges with line insertions above unchanged sinks;
- incompatible tsconfig/settings produce an explicit incomparable result.

### Phase 2: Semantic deltas

Compare analyzer facts, not only total scores:

- added/removed path operations;
- defense verdict changes;
- helper-hop and representation-churn changes;
- new/removed relay, fan-out, repeated-fork, junction, and pack findings;
- source/symbol reach gained or lost;
- once available, type-shape transformations gained or lost.

Emit a `FindingDelta` with before/after evidence, attribution, reach, and match
confidence. A changed line is direct attribution; a changed upstream source that
alters an unchanged sink is propagated attribution. Unrelated unchanged findings
are classified as pre-existing and omitted from the change-review projection.

### Phase 3: Review prioritization

Rank change findings with a separate, inspectable score. Suggested dimensions:

- severity of the semantic delta;
- confidence that it was introduced by changed code;
- downstream reach into unchanged files/sinks;
- impossible defenses or opaque boundaries introduced;
- ease of locating a responsible changed expression;
- uncertainty penalty.

Do not rank by raw changed-line count. A one-line fallback feeding twenty sinks
can matter more than a large mechanical refactor.

Use two queues:

1. **Regressions from this change** — direct and propagated deltas.
2. **Possibly related** — opaque paths or uncertain matches touched by the
   change, clearly excluded from the verdict.

### Phase 4: Scoped overview and code-map experience

Add a change lens to the overview, not a new disconnected report stack.

The overview should show:

- changed files ordered by introduced burden, not alphabetically by default;
- counts for introduced, worsened, improved, removed, and possibly related
  findings;
- top changed sources and their total downstream reach;
- whether impact stays in one file, crosses components, or crosses files;
- a concise verdict: worse, improved, mixed, unchanged, or incomparable.

Selecting a delta opens the existing code-map workspace. Source annotations
distinguish changed lines, new path steps, removed steps, and unchanged downstream
steps. The detail panel shows before/after evidence without navigating away.

Every count must be drillable and agree with its member list. Removed code may be
shown as a compact base snippet in the detail panel; it should not destabilize the
current source pane.

### Phase 5: Agent-ready Markdown and automation

Produce a short review handoff ordered by consequence:

```text
Regression: repeated normalization introduced at src/Profile.tsx:61
Changed cause: `profile.name ?? ""`
Downstream reach: 7 sinks in 3 files (5 unchanged)
Before: Profile.name was normalized once at loadProfile()
After: two downstream fallbacks plus one optional read
Action: preserve the loader contract or document why the new uncertainty is real.
```

The Markdown should include:

- overall verdict and scope;
- top regressions with changed cause, path, reach, and next action;
- improvements/removals;
- uncertain touched boundaries;
- a possibly-related section excluded from the verdict;
- exact reproduction command/settings.

Extend failure behavior beyond the current worst-score comparison only after the
delta model is reliable. Candidate policies include “fail on any high-confidence
high-severity regression” and a configurable introduced-burden threshold.

### Phase 6: Performance and incremental reuse

Profile before caching. Likely reusable layers are:

- project discovery and tsconfig routing;
- source-file hashes and unchanged AST/program inputs;
- normalized symbol/type-shape summaries;
- unchanged file projections.

Cache keys are disposable generation keys, not durable cross-machine IDs. A
single-file/changed-file review should usually finish in 1–5 seconds while still
retaining project-wide downstream context.

## Acceptance criteria

- The tool accepts a non-Git change manifest and can optionally derive one from a
  Git range.
- A changed upstream value can be tied to consequences in unchanged files.
- Added, removed, improved, regressed, and possibly-related facts are not
  conflated; known pre-existing facts are omitted.
- Line shifts and file renames do not make all sinks appear new.
- Every claimed regression shows a changed cause, before/after evidence, reach,
  and match confidence.
- The overview and Markdown lead with the few most consequential change-induced
  problems rather than total report volume.

## Non-goals

- general-purpose Git hosting or PR-comment integration;
- durable cross-commit entity IDs;
- measuring agent token use, tool calls, or chat-log churn;
- inferring product intent from the size of a diff;
- blocking a change on low-confidence matches.

## Main risks

- **False churn from matching:** use tiered matching and expose uncertainty.
- **Base/current configuration drift:** record analyzer and tsconfig fingerprints
  and declare incompatible runs incomparable.
- **Scoped analysis hiding reach:** scope finding origins, not checker/program
  context or downstream reach.
- **Overview overload:** default to regressions; keep improvements and possibly
  related facts as explicit secondary lenses, and keep pre-existing facts out of
  change-review mode.
