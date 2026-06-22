# Plan: Tighten the tsx-dataflow → agent fix loop

**Date:** 2026-06-22
**Source feedback:** `/Users/byronwall/repos/modeler/tmp/data-flow/20260622-tsx-dataflow-cleanup-tool-review.md`
**Target:** `src/core.mjs` (single-module CLI), `test/core.test.mjs`

## What this plan optimizes for

The feedback came from an agent using the tool exactly as intended: generate the
analysis, then have an agent apply fixes from it. The goal here is to make that
loop tighter — so a work packet is read as a **responsibility map** and the agent
produces a clean split rather than a catch-all `renderModel`.

### In scope (what the user wants)

- Stronger **grouping / sink-family split** recommendations (the feedback's
  single most-praised behavior).
- Output that is **standalone and targeted on the files the tool was given** —
  every signal derived from the trace already in hand.

### Explicitly out of scope (the user does not want these)

- Anything that searches the repo for "similar code", code owners, package
  boundaries, or architecture/convention docs. (Feedback items: ownership-aware
  grouping, "local convention adapters", "project-specific archetypes",
  "incorporate code owners".) These break the standalone-on-given-files model.
- Entity-ownership rules that require knowing the wider app. We keep only the
  *local* version (a flat object that mirrors many fields is a smell we can see
  in one file), not the "is this entity-backed UI" version.

## Current state (so we build on what exists, not rebuild)

A surprising amount of the feedback is already implemented. Confirmed by reading
`src/core.mjs`:

- **Sink families** — `sinkFamilyOf` (3236) buckets into `svg-shell`, `geometry`,
  `control-flow`, `style`, `text`, `other`. `computePackGroups` (3250) detects
  objects feeding ≥2 families → `overpacked-bag`; `overpackedSplitLines` (3322)
  renders the split block.
- **Shape tags** — `classifyPathShape` (3046) → `geometry-chain`,
  `collection-render-model`, `control-flow-gate`, `presentation-pack`,
  `domain-normalization`, `cross-component-relay`, surfaced via
  `reviewerSummaryFor` (3581).
- **Extraction proposal** — `extractionProposalFor` (3388) synthesizes a helper
  signature; `proposedHelperName` (3432) avoids banned catch-alls
  (`BANNED_SUGGESTION_IDENTIFIERS`, 110).
- **Confidence/risk** — `confidenceFor` (4462) gives score + reason + risk;
  `severityFor` (4564); `ownershipHintFor` (3603) is a 4-rung ladder.
- **Baseline diff** — `diffBaselineSinks` (3694) → removed/improved/regressed/
  newTop, keyed by `file::signature`; `appendBaseline` (4419) renders it.

The gaps below are the *deltas* worth closing, ordered by leverage-per-effort.

---

## Tier 1 — High leverage, squarely in scope, low risk

### 1.1 Per-family **named model** suggestions in the split block

**Problem.** `overpackedSplitLines` tells the agent *which attributes* belong to
each family but not *what to name each extracted model*. The feedback's ideal
output is:

```
Split into:
- chartSize:  width, height
- barSizing:  inner dimensions and widths
- realBars:   each input
- nullBar:    when + transform + rect dimensions
```

**Change.** In `overpackedSplitLines` (3322), for each family emit a suggested
model name derived from the family + the sink's JSX element/`data-part` context
(see 1.2 for the name source). Map: `svg-shell → chartSize`,
`geometry → <element>Geometry` / `barGeometry`, `control-flow → visibleWhen` or
`<noun>Visible`, `style → <element>Style`, `text → <noun>Label`,
`identity → pathRef` (new family, see 1.4). Keep the attribute list beside each.

**Files.** `overpackedSplitLines`, plus a small `familyModelName(family, sink)`
helper near `proposedHelperName` (3432).

**Test.** Extend the overpacked-bag test in the
"shape-aware suggestions…" describe block: assert each family line carries a
non-banned, domain-flavored name.

### 1.2 Domain-flavored names from JSX context (kill generic `renderModel`)

**Problem.** `proposedHelperName` still returns the generic `renderModel` for the
default case, and family names like `geometryModel` are not domain-specific. The
feedback wants `barSizing`, `nullBar`, `roadLabel`, `pathGeometry` — names that
say *why the value exists*.

**Change — standalone, no repo scan.** We already parse the JSX. Derive a domain
noun from signals on the sink node we already have:

1. the JSX element/tag name (`g`, `rect`, `path`, `textPath`, `Wire`),
2. a `data-part` / `data-scope` attribute if present on the element,
3. the sink attribute itself (`transform`, `href`, `when`).

Compose `noun + family-suffix` (e.g. `data-part="null-bar"` + geometry →
`nullBarGeometry`; `path` + identity → `pathRef`; `textPath` + content →
`roadLabel`). Fall back to the family default only when no noun is available.
Verify the result against `BANNED_SUGGESTION_IDENTIFIERS`.

**Prereq.** `getSinkExpression`/`buildSinkRecord` must retain the element tag and
nearby `data-*` attributes on the sink record. Check what `jsxTagAndAttributes`
(4071) already captures; thread tag + data-part onto the sink record if missing.

**Files.** `buildSinkRecord` (1679), `proposedHelperName` (3432), new
`domainNounFor(sink)`.

**Test.** A fixture with `data-part="null-bar"` on a `transform` sink should yield
a name containing `nullBar`; assert no output name is in the banned list.

### 1.3 **Responsibility summary** line from operation kinds

**Problem.** `reviewerSummaryFor` reports coarse shape tags, but the feedback
specifically wants the path collapsed into a human responsibility list built from
the operation kinds the tool already records:

```
responsibilities: prop defaults, profile normalization, collection sizing, SVG geometry, string formatting
```

**Change.** Add `responsibilitiesFor(sink)` that walks `representativeSteps`,
maps step `kind` → responsibility phrase (`fallback`/`optional-read` →
"defaults & normalization", `template` w/ arithmetic → "geometry/sizing",
`.map/.filter` → "collection shaping", `call` into helper → "helper derivation",
final `template`/string → "string formatting"), de-dupes preserving order, and
emits one line. Surface it under **Review summary** in `renderWorkPackets` (2329)
and as a field in the JSON payload.

**Files.** New helper near `classifyPathShape`; call site in `renderWorkPackets`
(~2375) and `reviewerSummaryFor`.

**Test.** The geometry fixture's packet should contain a `responsibilities:` line
listing at least defaults and geometry.

### 1.4 Split **identity** (`id`/`href`) out of `other`

**Problem.** The feedback repeatedly calls for separating *identity/reference*
(`id`, `href`) from *content* and *visibility*. Today `id`/`href` fall into the
`other` family, so an object feeding `d`, `id`, `href`, `when`, and text reads as
"geometry + control-flow + other + text" — the identity concern is invisible.

**Change.** Add an `identity` family to `sinkFamilyOf` (3236) for `id`, `href`,
`xlink:href`, `for`, `name`, `headers`. Add `FAMILY_LABELS.identity = "Identity"`
(3311). This automatically improves `computePackGroups`, the split block, and the
named-model suggestion (`pathRef`/`roadPathRef`).

**Files.** `sinkFamilyOf`, `FAMILY_LABELS`, the `IDENTITY_ATTRIBUTES` set near
the other attribute sets (79–105).

**Test.** A fixture object feeding `d` + `href` should report a 3-family
overpacked bag including `Identity`.

---

## Tier 2 — Scoring & labeling the over-packing smell

### 2.1 Score object packing by **sink-family diversity**

**Problem.** Over-packing is detected (`overpacked-bag`) but does not influence
ranking, and a short JSX expression that reads a many-family bag can rank *below*
a long-but-clean path. The feedback (item 7 / "score object packing directly")
wants packing treated as a first-class smell.

**Change.** Compute a `packDiversity` metric per sink = max family count among the
packs it flows through (0 if none). Add a small weighted term to `burdenScore`
(4510) — e.g. `+ 0.1 * normalized(packDiversity * 3)` with the existing weights
rebalanced so the vector still sums to 1.0. Keep the weight modest; the intent is
to break ties toward overpacked sinks, not to dominate depth/churn.

**Files.** `metricsFor` (1729) to add `packDiversity` (needs pack-group info, so
compute groups before ranking or fold into `rankSinks` 1861), `burdenScore`.

**Test.** Two sinks with equal depth/churn but one flowing through a 3-family bag
ranks first. Snapshot the burden weights so the rebalance is intentional.

**Risk.** Changes ranking → will shift `--sort burden` ordering in existing
tests. Update expected orderings deliberately and note in commit.

### 2.2 Local "mirror object" taste warning (no repo knowledge)

**Problem.** Feedback wants discouraging objects that clone many source fields
into a parallel owner. The *standalone* slice: detect a packed object that is
mostly `pack` of straight `property-read`s from a single root with little/no
transformation (`representationChurn` low, mergeWidth small, many fields). That's
a "mirror" smell visible in one file.

**Change.** In `computePackGroups`, flag a group as `verdict: "mirror"` when its
members are predominantly representation-only reads off one root. Emit a one-line
note: "This object mostly mirrors `props.X` — prefer a narrow display adapter
(e.g. `rowCountLabel`) over copying fields." Do **not** mention entities or repo
conventions.

**Files.** `computePackGroups` (3250), a render note in `renderWorkPackets`.

**Test.** A fixture object literal of three `props.source.*` reads triggers the
mirror note; an object with real transformation does not.

---

## Tier 3 — Risk labeling & operational confidence

### 3.1 Label findings: **reviewability** vs **runtime-risk** vs **taste**

**Problem.** The feedback's top recurring ask (items: "Avoiding false positives",
"Separate runtime risk from reviewability burden") is that engineers dismiss
useful findings as non-bugs. Make the framing explicit.

**Change.** Add `riskType(sink)`:
- `runtime-risk` when `impossibleDefenseCount > 0` or `unknownEdgeCount > 0`
  (a fallback that can't fire / an unresolved hop is a real defect signal),
- `taste` when the only signal is mild over-packing / generic naming,
- `reviewability` otherwise (the default, and the honest label for long-but-
  correct paths).

Surface as a one-word tag in the packet header and findings view, and a JSON
field. This reframes the report from "accusatory" to "review radar".

**Files.** New `riskType` near `severityFor` (4564); header in `renderWorkPackets`
(2346) and `renderFindings` (2212).

**Test.** Impossible-fallback fixture → `runtime-risk`; deep-but-clean path →
`reviewability`.

### 3.2 Operational confidence: add a **suggested action** for guards

**Problem.** `confidenceFor` says "A guard's type is too loose" but not what to
do. Feedback item 10 wants: preserve / remove / prove.

**Change.** Extend the `unknown`-guard and `impossibleDefenseCount` branches of
`confidenceFor` (4462) with an `action` string:
- loose guard → "Preserve the guard; narrow the type at the prop boundary before
  removing it."
- impossible fallback → "Safe to remove — unreachable under the checked types."
Render it under the **Risk** block in the packet.

**Files.** `confidenceFor`, packet render (~2434).

**Test.** Assert the action string appears for both branches.

---

## Tier 4 — Rewrite sketches & helper-chain collapse

### 4.1 Framework-specific **rewrite sketch** (shape, not a patch)

**Problem.** Candidate edits are prose. Feedback item 5 / 9 wants a tiny
idiomatic Solid shape so the agent sees the target structure.

**Change.** Add `rewriteSketchFor(sink)` returning a fenced snippet keyed off the
primary shape + family, using the names from 1.2:
- control-flow gate / identity+content →
  ```tsx
  const visibleLabel = createMemo(() => { const v = source(); return v ? { …named fields } : undefined; });
  <Show when={visibleLabel()}>{(label) => <textPath href={pathRef().href}>{label().text}</textPath>}</Show>
  ```
- geometry → the `barSizing` + `realBars` memo split.

Render under a new **Rewrite sketch** block in the packet, after the extraction
proposal. Keep it explicitly a *shape*, header-noted as illustrative.

**Files.** New `rewriteSketchFor`; call site in `renderWorkPackets` (~2425).

**Test.** Geometry packet contains a `createMemo` sketch; control-flow packet
contains a `<Show when=` sketch.

### 4.2 Detect **pass-through helper chains** → recommend one cohesive memo

**Problem.** Feedback "Prefer one stable boundary per responsibility over many
pass-through helpers" — a dozen one-line accessors that only rename math are as
hard to review as one long expression. We already have `isPassThrough` (984) and
`helperHops`.

**Change.** When a representative path contains ≥3 consecutive steps that are
single-use, representation-only accessors in the same file (detectable from
`representativeSteps` + `helperHops` + churn), add a candidate edit: "Collapse the
chain `a → b → c` into one named memo (`barSizing`) — these only rename
intermediate math." Use the actual step labels in the message.

**Files.** A detector near `candidateEditsFor` (3135); reuse step kinds.

**Test.** A fixture with three chained one-line derived accessors produces the
collapse recommendation; a single direct path does not.

---

## Tier 5 — Baseline / review-diff (standalone parts only)

### 5.1 Automatic baseline **path normalization**

**Problem.** Feedback items 2 / 5: a baseline generated from a `git worktree` has
a different absolute root, so `diffBaselineSinks` keys (`file::signature`) never
match and everything reads as removed+new.

**Change.** Normalize both sides to workspace-relative before keying in
`diffBaselineSinks` (3694): strip any leading common root, compare on the
repo-relative tail. The current run already stores relative paths via
`relativePath` (4600); apply the same normalization to baseline file fields,
tolerating an absolute or differently-rooted prefix.

**Files.** `diffBaselineSinks`, helper `normalizeBaselinePath`.

**Test.** A baseline JSON whose `file` fields carry a `tmp/worktree/` prefix still
matches the current run and reports `improved`, not `removed`+`newTop`.

### 5.2 Target-aware baseline result (`--target`)

**Problem.** Feedback items 1 / 8: after fixing the worst item, the next item
becomes "new top" and reads like a regression. The user wants to ask specifically
about the item they fixed.

**Change.** Add `--target <file>:<line>` (or a sink signature) to `parseArgs`
(128). In `compareBaseline` (3678), if a target is set, report its specific
outcome: `removed` / `improved (b→a)` / `unchanged` / `worsened` /
`moved-to-new-sink`, separately from the global "new top". Render a dedicated
**Target** sub-block in `appendBaseline` (4419).

**Files.** `parseArgs`, `compareBaseline`, `appendBaseline`, help text (319).

**Test.** With `--target` pointing at a baseline sink that's gone, output says
`Target: … removed` and still lists the global next target separately.

### 5.3 Touched-file review-diff section

**Problem.** Feedback item 8 / "PR mode": group baseline diff by touched file:
"Fixed in touched files / New findings in touched files / Global next target".

**Change.** This is standalone if "touched files" = the set of files appearing in
the target(s) or a `--touched a.tsx,b.tsx` flag (no git scan required; the user
passes the files, matching the standalone model). Group `removed`/`improved`/
`regressed`/new findings by file for the touched set; render a compact markdown
block ready to paste into a PR description.

**Files.** `--touched` in `parseArgs`; new `renderTouchedFileDiff` used by
`appendBaseline`.

**Test.** Given `--touched fixture.tsx` and a baseline, the section lists fixed
and remaining findings under that filename and the global next target outside it.

---

## Deferred / not doing (per user scope)

- Code-owner / package-boundary / architecture-doc-aware clustering.
- "Local convention" guardrails read from repo docs.
- Entity-backed-UI ownership rules (kept only the local mirror-object smell, 2.2).
- Deeper Solid `<Show>`/`<For>` keyed-accessor reactivity modeling — analyzer-
  internal, higher risk, lower payoff than the above; revisit only if noise from
  Show callbacks shows up in real runs. (Note: 4.1's sketch already nudges agents
  toward the right `<Show>` shape without modeling it.)

## Suggested sequencing

1. **Tier 1** first — it is the grouping work the user explicitly wants and is
   low-risk (output-only, no ranking changes). 1.4 (identity family) before 1.1/
   1.2 since names depend on the family set.
2. **Tier 3** (risk labels, suggested actions) — cheap, output-only, high
   reviewer value.
3. **Tier 4** (sketches, helper-chain collapse) — output-only.
4. **Tier 5** (baseline) — 5.1 path normalization is a near-pure bug fix; do it
   first, then 5.2/5.3.
5. **Tier 2.1** (ranking change) last and isolated, since it perturbs existing
   ordering tests and deserves its own commit.

Each item is independently shippable with its own test; none requires reading
outside the files the tool was handed.
