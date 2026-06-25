# Plan: Make `repeated-forks` Precise and Ranked

> **Status: implemented** (all six phases). See §5 for the measured outcome.

Follow-up to [`repeated-fork-split-detector.md`](./repeated-fork-split-detector.md).
This plan is driven by a real run against the `modeler` codebase (107 raw
candidates, top 20 reviewed). The detector fires, but most of what it surfaces is
ordinary control flow, and the ordering is effectively random. This document
audits that output and specifies the fixes.

## 1. Audit of the 20 reviewed findings

Source: `tmp/data-flow/repeated-forks.md` (modeler worktree).

### 1.1 Ordering is file-order, not severity-order

The output opens with `FORK-65-31` (MEDIUM, 2 sites, a nullish guard) and only
then reaches `FORK-533-10` (HIGH, 8 sites). The genuine union splits
(`props.node.kind`, `props.level`) sit near the **bottom**. The cause is
structural, not cosmetic:

- `detectRepeatedForks` sorts **per file** (`findings.sort(...)` at the end of
  the file pass).
- `buildReport` then concatenates per-file results in source-file discovery
  order: `forks.push(...analysis.forks)`.
- `renderRepeatedForks` does `forks.slice(0, maxItems)` with **no sort**.

So the global list is "files in discovery order, each internally ranked" — which
reads as random. All seven Combobox findings cluster together not because they
matter but because they share a file.

### 1.2 Classification of the 20 findings

**Genuine discriminated-split candidates (should survive, should rank top):**

| ID | Discriminant | Why it is real |
|---|---|---|
| `FORK-241-5` | `props.node.kind` → `condition`/`not`/`group` | Textbook discriminated union on a prop; each branch renders a different child component. Best finding in the set — yet currently MEDIUM and 19th. |
| `FORK-18-23` | `props.level` → `"group"` vs else | Domain enum prop; the three sites (`scope()`, `variant`, the root `<Show>`) are all in render position and pick structurally different wrappers. |
| `FORK-40-8` | `machine.state()` → `selected`/`editing` | Looked like a state-machine discriminant, but reading the source (`edit-in-place.tsx:40,55`) both sites are `if (state() !== X) return` **inside `createEffect` callbacks** — effect control flow, not render forks. Correctly **dropped** by Phase 2, not a survivor. |

**Boolean / toggle state (mostly not splits):** `FORK-27-8` `copied()`,
`FORK-19-23` `isExpanded()`, `FORK-29-11` / `FORK-193-23` `isClickable()`,
`FORK-49-8` `isExpandable()`, `FORK-735-30` `props.disabled`, `FORK-28-8`
`local.disabled`. These key on a transient boolean signal that toggles small
presentational differences. A component is not "two components" because a row can
be expanded; splitting on ephemeral UI state is wrong advice.

**False positives — control flow, not render forks (should drop):**

| ID | Discriminant | Actual pattern |
|---|---|---|
| `FORK-533-10` | `e.key` (Enter/Arrow/Tab/Escape) | Entire group lives inside `onKeyDown` — a keyboard-event dispatch. Verified at `combobox.tsx:529`. You cannot split a component by key press. Marked **HIGH**. |
| `FORK-445-8` | `e.inputType` | Same: inside an `onInput`/`onBeforeInput` handler. |
| `FORK-121-10` | `box` | `const box = boxRef(); if (box) {…}` repeated across **separate** effects/handlers. Nullable narrowing, not forking. Verified at `combobox.tsx:119,134`. |
| `FORK-250-8` / `FORK-622-8` | `sel` / `entity` | Same guard-clause pattern in different helper functions. |
| `FORK-99-8` / `FORK-72-8` | `currentCamera` / `forced2d` | `if (!currentCamera) return;` guards inside `ActionsProvider` — a context provider, not a visual component. |
| `FORK-65-31` | `phase.value` → `undefined`/`null` | Two nullish guards on one value. Defensive null-handling, not a variant axis. |
| `FORK-28-23` | `props.source.cardinality !== undefined` | Optional-prop presence check ("show this if present"). |

Net: of 20, **~2–3 are genuine**, ~6 are boolean toggles (weak), and ~9–11 are
outright control-flow false positives. Precision on the reviewed slice is roughly
10–15%.

### 1.3 Root causes

**1.3.1 — Branches in non-render scopes are counted.** The transparent-accessor
rule (introduced so a fork inside `const active = () => cond ? a : b` is
attributed to the component) over-reaches: it also pulls in branches inside
`onKeyDown`, `createEffect`, `onMount`, and other callbacks. Those are control
flow, not render structure. This single cause produces the `e.key`, `e.inputType`,
`box`, `sel`, `entity`, and provider-guard false positives — the majority.

**1.3.2 — Guard clauses (`if (!x) return`) are treated as forks.** A then-branch
that only returns/throws and renders nothing is *narrowing one path*, not
*forking into siblings*. `machine.state()`, `currentCamera`, `box`, etc. are all
this shape.

**1.3.3 — Discriminants are keyed by text, collapsing distinct bindings.** `box`
is re-declared `const box = boxRef()` inside five different functions; the
detector merges all five because the *text* "box" matches. They are five
unrelated locals. Keying should be by resolved symbol (or at least by shared
lexical binding), not raw text.

**1.3.4 — Bare-boolean and nullish discriminants are accepted as variants.** A
real discriminated split keys on a domain union with ≥2 *named literal* values
(`"bar"`/`"line"`, `condition`/`not`/`group`). Bare `if (x)` (no `branchValues`),
nullish sentinels (`=== undefined`/`null`), and `true`/`false` are not variant
axes. The current gate (`hasStructural` + `branchValues>=1 || sites>=3`) lets all
of these through.

**1.3.5 — Severity rewards raw site count.** `severity = sites*2 + branchValues +
branchExclusive*2`. Eight `e.key` sites → HIGH; three real `node.kind` sites →
MEDIUM. The weighting is backwards for the thing we care about.

**1.3.6 — "Findings in this component" is component-wide, not discriminant-gated.**
Every Combobox finding claims "would touch 37 ranked findings" — the same 37,
regardless of discriminant. It implies splitting on `e.key` fixes 37 sinks. The
related-sink set must be gated to the discriminant's branches, or the wording
must stop claiming causation.

**1.3.7 — Symptom: nonsense sub-component names.** `EnterCombobox`,
`Undefined(anonymous component)`, `DeleteContentBackwardCombobox`. These are a
*tell* that the discriminant is not a variant axis. After §1.3.4 they disappear
on their own; no separate fix needed beyond handling anonymous owners.

## 2. Fixes

Ordered by precision impact. Each is independently shippable and testable against
the 20 findings above.

### Phase 1 — Global ranking (cosmetic, do first)

1. In `buildReport`, after `relateForks`, sort the combined list:
   `repeatedForks.sort((a, b) => b.severity - a.severity)`. (Or sort inside
   `renderRepeatedForks` before `slice` — but sorting the stored array means the
   JSON/API and HTML agree.)
2. Keep the per-file sort in `detectRepeatedForks` (harmless) or drop it.

**Acceptance:** `props.node.kind` and `props.level` appear in the top half;
findings are no longer clustered by file.

### Phase 2 — Render-path scoping (kills the majority of FPs)

Restrict counted branches to those that are actually on a render path. A branch
is render-relevant only if its nearest enclosing function-like is one of:

- the component body itself (the function that returns JSX), **or**
- a derived accessor/memo whose value flows into JSX (an arrow/`createMemo`
  assigned to a `const` that is referenced inside the returned JSX, or a JSX
  factory like the `content = (…)` local).

Exclude branches whose nearest enclosing function-like is:

- an **event handler** — assigned to a JSX `on*` attribute, or named `on[A-Z]…`
  / `handle[A-Z]…`, or passed to `addEventListener`;
- a **lifecycle/effect callback** — argument to `createEffect`, `createRenderEffect`,
  `onMount`, `onCleanup`, `createReaction`, `untrack`, etc.;
- any function that does not itself feed JSX.

Implementation: in `ownerFor`, when walking up, stop and **reject** the branch if
the nearest function-like is a non-render callback (classify it by how it is used:
JSX attribute initializer, `on*` name, or known reactive-primitive argument).
Only attribute to a component when the branch is reached through render-feeding
scopes. The existing `containsJsx` memo already distinguishes JSX-returning
functions; extend it with a "feeds JSX" check for accessors.

**Acceptance:** `FORK-533-10` (`e.key`), `FORK-445-8` (`e.inputType`),
`FORK-121-10` (`box`), `FORK-250-8` (`sel`), `FORK-622-8` (`entity`),
`FORK-99-8`/`FORK-72-8` (provider guards) all disappear.

### Phase 3 — Drop guard clauses and require real variants

3. **Guard-clause filter.** Skip an `if` site whose then-branch is exclusively a
   `return`/`throw`/`continue`/`break` with no JSX in it. (Reuse the JSX check.)
4. **Discriminant quality gate.** Define a *named-literal* value as a string or
   numeric literal that is **not** `undefined`/`null`/`true`/`false`/`""`. Emit
   only when the discriminant has **≥2 distinct named-literal branch values**, OR
   it is a `Switch`/`Match` on a literal union. Bare-boolean and nullish-only
   discriminants are dropped (or retained at LOW only when paired with strong
   branch-exclusive eager computation — decide during implementation; default to
   drop).

**Acceptance:** `FORK-65-31` (nullish), `FORK-28-23` (presence check), and the
boolean-toggle group (`copied()`, `isExpanded()`, `isClickable()`,
`isExpandable()`, `disabled`) drop out or fall to LOW. `props.node.kind`,
`props.level`, and `machine.state()` (selected/editing) survive.

### Phase 4 — Symbol-keyed discriminants

5. Key discriminants by the **resolved symbol** of the subject (via the
   TypeChecker), falling back to scoped text when no symbol resolves. Same-named
   locals in different functions no longer merge. This is partly mooted by
   Phase 2 (those locals live in excluded scopes) but prevents a recurrence for
   render-scope locals.

### Phase 5 — Honest severity and related-sink gating

6. **Reweight severity** toward what predicts a real split:
   `distinctNamedLiteralValues` (heavily), render-position site count (not raw
   count), and `branchExclusive` eager computation. Discount or zero out
   guard/handler-derived contributions. Recompute the HIGH/MEDIUM/LOW thresholds
   so a 3-value union outranks anything boolean.
7. **Gate related sinks** to those lexically inside the discriminant's branch
   bodies (the consequents already collected per site), and reword to
   "N ranked findings render under these branches" — drop the causal "splitting
   would touch N" claim for the component-wide set.

### Phase 6 — Output polish

8. Only emit a `Pascalish` sub-component name when branch values are named
   literals; otherwise say "one sub-component per branch." Handle anonymous /
   non-PascalCase owners (e.g. `content`, `(anonymous component)`) by reporting
   the enclosing named component plus a local label, or by suppressing render
   callbacks that are not components.

## 3. Validation

Re-run against the modeler worktree
(`tsx-dataflow --root <modeler> --view repeated-forks --max-items 20`) and assert:

- **Survivors:** `props.node.kind` and `props.level` rank in the top few. (The
  `machine.state()` candidate turned out to be effect-scoped — see §5 — so it is
  correctly dropped, not a survivor.)
- **Gone:** every `e.*` event-handler finding, every `if (!local) return` guard,
  and every nullish/boolean-toggle finding.
- Total candidate count drops from 107 to a small, high-signal set.
- Ordering is strictly severity-descending across files.

Add fixtures to `test/core.test.mjs` covering each rejection class:

- event-handler dispatch (`onKeyDown` switching on `e.key`) → **no** finding;
- repeated `if (!x) return` guard clauses → **no** finding;
- nullish guards (`=== undefined`, `=== null`) → **no** finding;
- a real prop union (`props.kind` → 3 string values across render sites) →
  **one** HIGH finding that ranks above a boolean-toggle fixture.

## 4. Sequencing

Phase 1 is a one-line ranking fix — ship immediately, it makes the existing
output usable. Phases 2–3 deliver the precision win and should land together
(render-scoping + variant gate remove ~90% of the noise). Phases 4–6 are
refinements: symbol keying hardens Phase 2, severity/related-sink work makes the
survivors trustworthy, and output polish removes the last rough edges. D/E from
the original proposal remain deferred.

## 5. Implementation outcome

All six phases shipped in `src/core.mjs` (`detectRepeatedForks`, `relateForks`,
`renderRepeatedForks`) with regression fixtures in `test/core.test.mjs`.

Measured on the modeler worktree:

- **Candidate count: 107 → 31** — a ~70% cut, almost entirely false positives.
- **Combobox: 7 findings → 0.** Every prior FP there (`e.key`, `e.inputType`,
  `box`, `sel`, `entity`) was event-handler or guard-clause control flow and is
  now excluded.
- **Ordering** is strictly severity-descending across files; the output now opens
  with genuine discriminated unions — `t().type`, `slot.kind`, `props.type`,
  `props.state`, `props.node.kind`, `props.slot.kind`, `currentTab()` — all HIGH.
- `props.node.kind` (the textbook three-way union) ranks near the top at HIGH;
  `props.level` survives at MEDIUM (single named value, binary split).

Deviations from the pre-implementation audit, found by reading source during
implementation:

- **`machine.state()` is not a survivor.** Both sites live inside `createEffect`
  callbacks (`edit-in-place.tsx`), so Phase 2 correctly drops it. The audit had
  mislabeled it a genuine state-machine split.
- **`props.node.kind` forks live in `createMemo` accessors**, not inline JSX.
  This made `createMemo`/`createSelector` deliberately *absent* from
  `SIDE_EFFECT_CALLEES` (they feed JSX and must stay transparent), and it means
  branch-gated related-sink counts are often 0 for the Solid memo idiom — the
  renderer falls back to honest "N findings render in this component (none inside
  a discriminated branch body)" wording rather than a false causal claim.
- **Chained ternaries** (`a ? x : b ? y : c`) required the nesting-dedupe window
  to stop before the `else` chain (`dedupeEnd`), otherwise the inner branches of
  a multi-way union were silently collapsed.
