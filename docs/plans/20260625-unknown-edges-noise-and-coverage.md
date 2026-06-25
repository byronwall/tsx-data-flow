# Unknown Edges — Diagnosis & Resolution Plan

> Investigation of the `unknown-edges` report produced by **tsx-dataflow**. Re-ran the
> report at `--max-items 50` and analyzed the full set (2,200 raw edges) from the modeler
> client. This documents *why* each edge is unknown and a concrete plan to drive the
> number down.

> **STATUS: IMPLEMENTED (2026-06-25).** All of P0–P4 landed in `src/core.mjs` with
> regression tests in `test/core.test.mjs`. Net effect on the modeler client: the report
> went from **2,200 raw rows (6 distinct in any 50-row page)** to **131 fully-distinct,
> meaningful rows**, and `summary.unknownEdges` now reports the distinct count (was 2,200).
> See **Implementation results** at the bottom.

## TL;DR

The report is **misleading in volume and noisy in content**:

1. **Duplication defect (highest impact).** The 2,200 reported edges collapse to **~320 distinct** `(file, line, kind, label)` edges. A `--max-items 50` run shows **6 unique edges** — the other 44 rows are byte-identical repeats. The table is effectively unusable for triage.
2. **~60% of the *unique* edges are intentionally-opaque host/framework calls** (`splitProps`, `.map`, `String`, `Array.from`, `undefined`, …) that should never have been surfaced as actionable "unknowns".
3. A **minority are genuinely interesting**: first-party method calls and imported values that the tracer *could* follow but currently can't.

Fixing #1 and suppressing #2 removes the overwhelming majority of the noise; #3 is real analyzer-coverage work.

---

## How an edge becomes "unknown"

Two code paths produce `edge.unknown` / `kind: "unknown-source"` (`src/core.mjs`):

### A. `call` edges — `traceCallExpression` (line ~2752)

```js
unknown: !callee || !context.functions.has(callee)
```

A call is marked unknown unless its callee is a **same-file first-party function** (`context.functions`, built per-file in `buildFileContext`, line 1734) **or** is resolved by cross-file descent (`traceCrossFileCall`, line 2574). Cross-file descent bails early when:

- the callee is **not a bare identifier** — `if (!ts.isIdentifier(expression.expression)) return null;` (line 2577). **This excludes every method call** (`x.map()`, `entityManager().getRelation()`, `Object.entries()`).
- the callee matches `^use[A-Z]` (hooks are intentionally opaque, line 2581).
- `crossDepth >= maxHelperDepth` — **default `maxHelperDepth` is 1** (line 208; note the `--help` text claims 3 — a doc bug).
- `resolveCatalogFn` finds no first-party declaration **with a single return expression** (`getFunctionReturnExpression`); multi-statement helper bodies don't resolve.

### B. `unknown-source` nodes — `traceIdentifier` (line ~2451)

```js
const isParameter = context.parameters.has(name);
const unknown = !isParameter && !declaration;   // declaration = context.variables.get(name)
```

An identifier is an `unknown-source` when it is **neither a tracked parameter nor a local variable declaration**. `buildFileContext` only registers `VariableDeclaration`s and function declarations — **imports are never registered**, so any imported value (or the `undefined` keyword) used in a render path dead-ends here.

### C. The duplication defect — `buildUnknownEdgeRows` (line 3079)

The trace graph **re-traces each sink independently, minting fresh nodes/edges per sink** (see the comment at lines 2823–2826). So one `splitProps` call crossed by 10 sink paths produces 10 distinct edge objects. `buildUnknownEdgeRows` builds a `seen` set (line 3110) **but only consults it for the `unknown-source` pass (line 3119), never to dedupe the `call`-edge pass.** Result: the row list is padded with identical rows, then sorted by `file:line`, so `--max-items N` is consumed entirely by the alphabetically-first edge's repeats.

---

## What the unknown edges actually are

320 unique edges across the sampled set. Categorized:

| Bucket | Unique | Representative labels | Verdict |
| --- | --- | --- | --- |
| **`undefined` keyword** (unknown-source) | 70 | `undefined` | **Noise — bug.** The `undefined` literal is traced as an identifier source. |
| **First-party method calls** (call) | ~60 | `getRelation`, `getRelationship`, `findingForSlot`, `getConcept`, `getPrimarySource`, `getDisplayColumns`, `quantity` | **Mixed.** Method calls (`x.getRelation()`) are unfollowable today; bare helpers (`quantity()`) are genuine coverage gaps. |
| **JS host methods** (call) | 44 | `.filter`, `.map`, `.slice`, `.join`, `.trim`, `.includes`, `.toUpperCase`, `.get` | **Noise.** Array/String/Map methods — opaque by design. |
| **Imported values / types** (unknown-source) | 31 | `Array`, `Object`, `Math`, `Map`, `Date`, `Set`, `Error`, `Portal`, `Concept`, `Step`, `Dataset` | **Noise (mostly).** Global namespace objects + imported components/values not registered as locals. |
| **Solid framework built-ins** (call) | 35 | `splitProps`, `mergeProps`, `createSignal`, `createStore`, `children` | **Noise.** Known Solid APIs; intentionally opaque. |
| **Other free identifiers** (unknown-source) | 36 | `key`, `progress`, `args`, `item`, `relationship`, handlers | **Mixed.** Some are unresolved callback params / destructures worth following. |
| **Module-level constants** (unknown-source) | 26 | `SCOPE`, `STORY_FIXTURE`, `DEFAULT_CONTEXT_GROUP_ROW_LIMIT`, `ORDER_*_ID` | **Mostly noise.** Imported consts (`import { SCOPE } from "./search-view"`); constant fixtures. |
| **JS globals as calls** (call) | 18 | `String`, `Boolean`, `Array.from`, `isArray` | **Noise.** |

> **~190 of 320 unique edges (~60%, and a far higher share of the 2,200 raw rows) are
> host/framework/keyword noise that should be suppressed, not "resolved."**

### Confirmed against source

- `canonical-table.tsx:22` — `entityManager().getRelation(id)` → method call, callee is a `PropertyAccessExpression` → cross-file descent rejected at line 2577.
- `search-hero.tsx:201` — `Step.findingForSlot(slot, …)` → `Step` becomes `unknown-source` **and** `findingForSlot` becomes an unknown `call` (two edges from one expression).
- `data-table/index.tsx:191` — `Array.from({length: …}, …)` → `Array` (unknown-source) + `from` (call): two edges.
- `data-table/index.tsx:137` — `String(row[column] ?? "")` → global `String()` call.
- `command-turn-view.tsx:52` — `data-scope={SCOPE}` where `import { SCOPE } from "./search-view"` → imported value, never registered locally → `unknown-source`.
- `canonical-table-block.tsx:32` — `quantity(canonicalTables().length)` → genuine bare first-party helper the tracer should follow.

---

## Resolution plan

Ordered by impact-to-effort. Each item is a change in `src/core.mjs`.

### P0 — Dedupe edge rows (kills ~85% of report volume)

In `buildUnknownEdgeRows` (line 3083), guard the `call`-edge push with the same `seen`
key already computed for the `unknown-source` pass:

```js
for (const edge of graph.edges ?? []) {
  if (!edge.unknown) continue;
  ...
  const key = `${file}:${line ?? ""}:${edge.kind}:${label}`;
  if (seen.has(key)) continue;        // <-- add
  seen.add(key);                      // <-- move up, before push
  rows.push({ ... });
}
```

Carry a `count`/`occurrences` field so the (legitimately useful) "how many sink paths cross
this edge" signal is preserved instead of discarded. Add a regression test asserting one
row per distinct edge for a fixture with a fan-out sink.

> Expected: `--max-items 50` would show ~50 *distinct* edges instead of 6.

### P1 — Classify & suppress host/framework noise

Introduce an `opaqueReason` classification so these are either filtered out or grouped
under a collapsed "expected boundaries" section rather than listed as actionable unknowns:

- **JS host methods & globals** — recognize when the callee is a `PropertyAccessExpression`
  whose method name is a known `Array`/`String`/`Object`/`Map`/`Set` member, or a call to a
  global (`String`, `Boolean`, `Array`, `Object`, `Math`, `JSON`, `Date`). Tag `kind: "host-call"`, not `unknown`.
- **Global namespace objects as sources** — `Array`, `Object`, `Math`, `Map`, `Set`, `Date`,
  `JSON`, `Error` resolving to lib globals should be `kind: "global"`, not `unknown-source`.
- **Solid built-ins** — maintain a small allowlist (`splitProps`, `mergeProps`, `createSignal`,
  `createStore`, `createMemo`, `createResource`, `children`, `batch`, `untrack`, …); tag
  `kind: "solid-builtin"`. (Note `createSignal`/`createStore` are already partially modeled
  as accessors in `registerVariable`; extend coverage so the *call site* isn't re-flagged.)
- **`undefined` literal (P1a, quick win)** — in `traceIdentifier`, short-circuit the
  `undefined`/`NaN`/`Infinity` keywords to a `literal` trace (like `null`/`true`/`false`
  already are via `sourceTrace(..., "literal", ...)`), removing all 70 `undefined` rows.

### P2 — Follow method calls on first-party objects

Extend `traceCrossFileCall` to handle `PropertyAccessExpression` callees
(`receiver.method()`): resolve the method symbol via the checker (`resolveCatalogFn` already
uses `getSymbolAtLocation` + alias resolution — it just needs to be fed `expression.expression.name`)
and descend if first-party. This recovers `getRelation`, `getRelationship`, `findingForSlot`,
`getConcept`, etc. Gate behind first-party check so library methods stay opaque.

### P3 — Resolve imported values & module constants

Register module-level imports/consts as traceable sources:

- In `buildFileContext`, capture `ImportSpecifier`/`ImportClause` bindings and top-level
  `const` declarations into a `moduleBindings` map.
- In `traceIdentifier`, before falling through to `unknown-source`, look up the binding and
  either (a) alias it to the imported declaration's initializer when first-party and
  cheaply resolvable, or (b) tag it `kind: "imported-const"` with the resolved
  source module — actionable context instead of a dead end. This addresses `SCOPE`,
  `STORY_FIXTURE`, `DEFAULT_CONTEXT_GROUP_ROW_LIMIT`, `ORDER_*_ID`, imported components.

### P4 — Raise/clarify helper depth & fix doc

- Reconcile `maxHelperDepth` default (code `1` vs `--help` text `3`). Pick one; bump default
  to `2` if cost allows so two-hop helper chains resolve.
- Improve multi-statement body resolution in `getFunctionReturnExpression` (follow the last
  `return` statement, not just expression-bodied arrows).

### Expected outcome

| After | Effect |
| --- | --- |
| P0 | 2,200 → ~320 rows; report becomes triage-able |
| P1 | ~320 → ~130 unique (drops ~190 noise edges incl. all 70 `undefined`) |
| P2 | recovers ~40–50 first-party method edges |
| P3 | recovers ~50 imported-value / constant edges |
| **Net** | A short list of **genuinely unresolved** first-party flows worth investigating |

---

## Reproduce

```sh
# Full set as JSON (for counting/aggregation)
tsx-dataflow --root . --view unknown-edges --max-items 1000 --format json

# 50-row markdown re-run (note: --out takes a FILE path for a single view, a DIR for --view all)
tsx-dataflow --root . --view unknown-edges --max-items 50 --out tmp/data-flow/unknown-edges-50.md
```

---

## Implementation results

All changes in `src/core.mjs`; 6 regression tests added in `test/core.test.mjs` (114 pass).

| Step | What landed | Modeler unique-row count |
| --- | --- | --- |
| baseline | — | 2,200 raw (6 distinct per 50-row page) |
| **P0** | `buildUnknownEdgeRows` dedupes by `(file,line,kind,label)`, carries `occurrences` | 679 |
| **P1a** | `traceIdentifier` treats `undefined`/`NaN`/`Infinity` as literals | (folded into P1) |
| **P1** | `isOpaqueByDesignCall` flips `unknown:false` for host methods / JS globals / Solid builtins; global namespace objects (`Array`, `Object`, `Math`, browser globals like `localStorage`) trace as `literal` | 341 |
| **P2** | `traceCrossFileCall` accepts `PropertyAccessExpression` callees; `traceableFromSymbol` resolves method / get-accessor / property-arrow declarations; receiver lineage preserved | 251 |
| **P3** | `buildFileContext` collects import bindings; imported values trace as a known `import` source-boundary kind; local functions referenced as values resolve via `context.functions` | 167 → **131** |
| **P4** | `--max-helper-depth` default reconciled to **2** (doc said 3, code said 1); `summary.unknownEdges`/`graph.unknownEdges` now report the **distinct** count via `countDistinctUnknownEdges` | 131 (summary consistent) |

### What the 131 residual rows are (correct to leave unknown)

- **External / package helpers** (`getModelName`, `createListCollection`) — outside the analyzed root or in `node_modules`; `isFirstPartyDecl` correctly declines them.
- **Factory-produced callables** (`quantity = create_unit_formatter([...])`) — first-party but not a function/arrow literal, so unfollowable without modeling the factory.
- **Unbound callback parameters** (`item`, `key`, `concept`, `args`) — parameters of arrows passed to `.map`/`.forEach`/story-render functions, which (unlike `<For>`/`<Index>` render props) are not yet bound to their source. This is the largest remaining *coverage* gap and a good follow-up.

### Follow-ups (not done)

- Bind plain higher-order-callback parameters (`xs.map((item) => …)`) to their iterable source, mirroring the existing `renderPropBinding` for Solid control-flow components.
- Resolve symbols re-exported through barrel files (multi-hop alias resolution) so more first-party helpers descend.
