# Unknown Edges — Residual 131 Diagnosis & Resolution Plan

> **STATUS: IMPLEMENTED (2026-06-25).** P5–P9 all landed in `src/core.mjs` with 8 regression
> tests in `test/core.test.mjs` (122 pass). The modeler client `unknown-edges` report went
> from **131 → 16 distinct rows** — **0 `call` edges remain** (all 94 are now resolved or
> classified) and the 16 residual `unknown-source` rows are 15 Storybook CSF callback params
> + 1 component-internal render arg, none of which are analyzer bugs. See **Implementation
> results** at the bottom.

> Follow-up to [`20260625-unknown-edges-noise-and-coverage.md`](./20260625-unknown-edges-noise-and-coverage.md),
> whose P0–P4 work already landed and collapsed the modeler `unknown-edges` report from
> **2,200 raw rows → 131 fully-distinct rows** (dedupe + `undefined`/host/global/Solid
> suppression + method-call descent + import-boundary tagging). This document re-runs the
> report against the **current** analyzer, diagnoses each of the **131 residual** unknown
> edges, and lays out the next round of fixes.
>
> **This supersedes the "What the 131 residual rows are" / "Follow-ups" sections of the
> prior plan**, which are incomplete and in places incorrect (they label first-party
> railway-admin helpers as "external", never identify the path-alias resolution failure,
> and lump custom render-prop callback params under `.map` callbacks).

## How this was produced

```sh
# from the modeler client root (dev-refactor-with-tsx-dataflow-guiding worktree)
node <tsx-dataflow>/bin/tsx-dataflow.mjs --root . --view unknown-edges --max-items 500 --out tmp/data-flow-unknown
```

`--max-items 500` returns the full set (no truncation): **131 distinct rows**. Every bucket
below was confirmed by reading the cited source line in the modeler client and tracing it
through `src/core.mjs`.

## TL;DR

The 131 residuals are **real and mostly correctly-unknown**, but they split into five
diagnosable causes — three of which are fixable analyzer coverage, two of which are
"opaque by design, classify don't chase":

| # | Cause | Kind | Count | Verdict |
| --- | --- | --- | --- | --- |
| **1** | **Path-alias imports not resolved under the wrong tsconfig** | call | **~27** | **Bug — fixable.** First-party helpers imported via `~/…` / `@modeler/…` fail symbol resolution when run from repo root. |
| **2** | **Reactive accessor reads via property access** (`props.x()`, `store.x()`, `ctx.x()`) | call | **~45** | **Classify, don't chase.** No function body to descend into — these are signal/prop/store boundary reads. Should be a *known* accessor kind, not `unknown`. |
| **3** | **Custom-component render-prop children + `<For>` destructuring** | unknown-source | **~25** | **Bug — fixable.** `renderPropBinding` only knows native `<For>/<Show>/<Index>` with a single identifier param. |
| **4** | **Factory-produced callables & library/DOM calls** | call | **~22** | **Classify, don't chase.** `quantity = create_unit_formatter(...)`, `createListCollection`, `el.getTotalLength()`. |
| **5** | **Story args, enums, globals, array-cb params** | both | **~12** | **Mostly out of scope / classify.** Storybook `render:(args)=>`, `SVGElement`, `Emphasis`, `.sort((left,right)=>)`. |

Causes **1** and **3** are genuine coverage bugs that together account for **~52 of 131
rows** and should be fixed. Cause **2** (~45 rows) is the single biggest bucket and is a
*classification* problem — these are not failures, they are reactive boundaries that the
report mislabels as `unknown`. Causes **4/5** (~34 rows) are correctly opaque and just need
a non-alarming label.

---

## Current code paths that mint an unknown edge

(Verified line numbers in `src/core.mjs` as of 2026-06-25 — note these differ from the prior
plan, which predates the landed P0–P4 work.)

### `call` edges — `traceCallExpression` (line 2819)

The terminal `unknown` flag (lines 2941–2944):

```js
const unknown =
  !callee ||
  (!context.functions.has(callee) && !isOpaqueByDesignCall(ts, expression, callee));
```

A call lands here only after **cross-file descent** (`traceCrossFileCall`, line 2741)
returned `null`. The prior plan's claim that method calls bail at "line 2577" is **stale** —
`traceCrossFileCall` now accepts `PropertyAccessExpression` callees (line 2747) and
`maxHelperDepth` defaults to **2** (line 285). Descent returns `null` when:

- `resolveCatalogFn` (line 2114) → `checker.getSymbolAtLocation` + `getAliasedSymbol` finds
  **no symbol or no declaration** — this is what **alias imports** hit (Cause 1).
- `traceableFromSymbol` (line 1966) finds **no function-shaped declaration** — a `const x =
  factory(...)` (initializer is a *call*, not an arrow/function) returns `null` (Cause 4,
  `quantity`).
- the resolved declaration is **not first-party** (`isFirstPartyDecl`, line 2007) — real
  `node_modules` libraries (Cause 4, `createListCollection`).
- there is no function body at all because the callee is a **type-level property** (a signal
  accessor / prop typed `() => T`) — no declaration with `.body`, so `traceableFromSymbol`
  declines (Cause 2).

### `unknown-source` nodes — `traceIdentifier` (line 2618)

```js
const isParameter = context.parameters.has(name);
const unknown = !isParameter && !declaration;
```

Before reaching this, `traceIdentifier` tries `renderPropBinding` (line 2573 / 2384) to bind
Solid control-flow callback params. That binder only fires when (line 2410):

- the param is a **single identifier** (line 2392 requires `ts.isIdentifier(parameter.name)`),
  **and**
- the host element carries a `when`/`each`/`fallback` attribute
  (`CONTROL_FLOW_ATTRIBUTES`, line 126), **and**
- the host is a real `<JsxElement>` (not self-closing).

Anything else — a **custom component** that takes a render callback on `children`, a
**destructured tuple** param `([k, v]) =>`, an **`ErrorBoundary fallback`**, or a Storybook
`render: (args) =>` — falls through to `unknown-source` (Cause 3, 5).

---

## The 131 residuals, by cause (all confirmed against source)

### Cause 1 — Path-alias imports not resolved (≈27 `call` rows) — **BUG**

First-party helper functions that are ordinary `export function … {}` but are imported
through a TS path alias. When the analyzer runs from the repo root, the program it picks
does not carry the sub-app's `paths` mapping, so `getSymbolAtLocation` cannot resolve the
import and descent dies.

**Proof:** `instance-details.tsx` imports `telemetryStateLabel` from `~/state/instances`
(railway-admin's `tsconfig.json` maps `"~/*": ["./src/*"]`). The function is a clean
single-return first-party helper:

```ts
// client/apps/railway-admin/src/state/instances.ts:69
export function telemetryStateLabel(state?: TelemetryState | null): string {
  return formatIdentifierDisplayName(state ?? "unavailable");
}
```

Re-running scoped to that file:

```
--root . (repo root)                                    → 8 unknown (telemetry/instance/connection helpers)
--root client/apps/railway-admin --tsconfig …/railway-admin/tsconfig.json → 0 unknown
```

The edges **vanish** under the correct tsconfig. Affected labels (all railway-admin `~/…`
imports unless noted): `getCreateInstanceLiveUrl` (4), `getCreateInstanceRailwayUrl` (4),
`createInstanceJobStatusLabel` (4), `createInstanceJobElapsedLabel` (2), `telemetryStateLabel`
(2), `telemetryStateTone` (2), `instanceStatusTone` (2), `connectionStatusLabel` (1),
`connectionStatusTone` (1), `createInstanceJobHistory` (1), `deriveInstanceNameFromCompanyName`
(1), `filterInstanceRows` (1), `isPinnedInstance` (1), `shouldShowCreateInstanceJobsPanel` (1),
`instances` (1).

### Cause 2 — Reactive accessor reads via property access (≈45 `call` rows) — **CLASSIFY**

The callee is `receiver.name(...)` where `name` is a **signal getter, store accessor,
context method, or prop typed as a function** — there is no first-party *function
declaration* to descend into; the value's true origin is the signal/store/prop boundary.

```tsx
// edge.tsx:24            props.pinned()              ← prop typed () => boolean
// inspector/index.tsx:130 tabState.currentTab()      ← store accessor
// model-selector-trigger.tsx:61 context.getModelName(context.currentModelId())  ← context methods
// table-selector.tsx:326 virtualizer().getTotalSize()  ← chained accessor (also Cause 4 receiver)
```

Labels: `currentModelId` (3), `getModelName` (3), `t` (3), `pinned` (3), `mode` (3),
`currentTab` (2), `availableTabs` (2), `selected` (2), `isSelected` (2), `playing` (2),
`focus` (2), `children` (2), plus singles `selection`, `isResizing`, `isMenuOpen`,
`focusActive`, `canBuildModels`, `modelIds`, `speed`, `pinnedTxId`, `bounds`, `instances`,
`iconComponent`, `itemToString`, `isSelected`, `render`, `renderHeader`, `preview`, … These
are **not failures** — they are exactly the reactive boundaries the prop-relay / context-relay
views exist to surface. Reporting them as `unknown` is the defect.

### Cause 3 — Custom render-prop children & `<For>` destructuring (≈25 `unknown-source` rows) — **BUG**

The iterated/rendered element binds to a callback param that `renderPropBinding` can't follow.

```tsx
// debug-value.tsx:41  — custom component render-prop child (items prop, not `each`)
<TruncatingList items={[...v() as Set<unknown>]} previewCount={2}>
  {(item) => <DebugValue value={item} … />}
</TruncatingList>

// context-panel-row-list.tsx — generic ContextPanelRowList<Item>{(item, index) => …}
//   children: (item: Item, index) => JSX.Element  ← items source is the `items` prop
<ContextPanelRowList items={identityRelationships()}>
  {(relationship) => <ContextPanelIdentityRelationshipRow relationship={relationship} />}
</ContextPanelRowList>

// ecs-system-payload.tsx:47 — destructured tuple from a native <For each>
<For each={Object.entries(contentValue).slice(0, 12)}>
  {([key, value]) => <PayloadRow label={key} value={value} />}
</For>

// keyboard-shortcuts.tsx:37 — destructured tuple again ([category, shortcuts])
```

- Custom render-prop children: `item` (12), `concept` (4), `relationship` (2), `field` (1) — the
  binding source is a **prop** (`items`/`each`-like) on a first-party component, resolvable by
  reading the component's prop name conventions or its `<For each={…props.items…}>` body.
- `<For>` destructured tuples: `key` (3), `category` (2), `shortcuts` (1) — `renderPropBinding`
  rejects the array-binding-pattern param at line 2392.

### Cause 4 — Factory callables & library/DOM calls (≈22 `call` rows) — **CLASSIFY**

Correctly opaque; just need a non-`unknown` kind.

- **Factory-produced callable, first-party:** `quantity` (9). `export const quantity =
  create_unit_formatter([...])` — initializer is a *call*, so `traceableFromSymbol` returns
  null. (Also imported via the `@modeler/arktk/format` alias, so Cause 1 stacks on top.)
- **`node_modules` library factories/hooks:** `createListCollection` (4, @ark-ui),
  `createVirtualizer` (1, @tanstack), `createElementSize` (1), `createToaster` (1), `lexer`
  (1, `marked`). `isFirstPartyDecl` correctly declines these.
- **DOM/host methods not in the prototype allowlist:** `getTotalLength` (2), `getPointAtLength`
  (1), `getTotalSize` (1), `getAttribute` (1) — `el.getTotalLength()` on an off-DOM SVG `<path>`,
  `virtualizer().getTotalSize()`, `ref.getAttribute('href')`. These are real host methods, like
  the `.map`/`.slice` already suppressed by `isOpaqueByDesignCall`.

### Cause 5 — Story args, enums, globals, array-cb params (≈12 rows) — **OUT OF SCOPE / CLASSIFY**

- **Storybook story `render`/play args:** `args` (3) — `render: (args) => …`. Stories are not
  product render paths; arguably the analyzer should not trace `*.stories.tsx` render sinks at
  all, or should bind `args` to the story's `args`/`argTypes`.
- **`ErrorBoundary fallback` param:** `err` (1) — `<ErrorBoundary fallback={(err) => …}>`. A
  framework callback prop, bindable like Cause 3.
- **JS/DOM global not in the namespace allowlist:** `SVGElement` (1) — `x instanceof SVGElement`.
  Add to `JS_GLOBAL_NAMESPACES` (and siblings: `HTMLElement`, `Node`, `Event`, `Element`, …).
- **Imported enum used as a value:** `Emphasis` (1) — `Emphasis.NONE`. An imported `enum`; should
  trace as an `import` boundary like other imported values.
- **Array-method callback params inside helpers:** `left`/`right` (`.sort((left,right)=>)`),
  `phase` (`.map(phase=>)`), `posData` (`.map(posData=>)`), `icons` (`<For each={icons}>` where
  `icons` is a module const), `reference`. These are intermediates; binding `.map`/`.sort`
  callback params to their iterable (the standing follow-up from the prior plan) covers most.

---

## Resolution plan

Ordered by impact-to-effort. All changes in `src/core.mjs` unless noted.

### P5 — Fix path-alias symbol resolution (Cause 1, ≈27 rows, highest value) — **BUG**

When invoked from a repo root spanning multiple apps/packages, the analyzer must resolve each
file's imports using a program/checker that carries **that file's** `tsconfig.paths`. Options,
cheapest first:

1. **Per-file nearest-tsconfig program selection.** Walk up from each source file to its
   nearest `tsconfig.json`, build/reuse one `ts.Program` per tsconfig, and route
   `getSymbolAtLocation` through the program that owns the file. (The analyzer already emits
   per-tsconfig warnings — see the `strictNullChecks` notices — so it is tsconfig-aware; extend
   that into checker selection.)
2. **Merge path mappings.** Collect `compilerOptions.paths` + `baseUrl` from every discovered
   tsconfig into the single program's options. Cheaper but can collide when two apps map the
   same alias (`~/`) to different roots — only safe if scoped per-file.

Add a regression fixture with two pseudo-apps that both use `~/*` → their own `src`, asserting a
helper imported via `~/…` descends (no unknown edge).

> Expected: removes the ~27 railway-admin rows and unblocks Cause 4's `quantity` once its alias
> resolves (leaving only the factory-shape issue).

### P6 — Classify reactive accessor reads (Cause 2, ≈45 rows, biggest bucket) — **CLASSIFY**

When `traceCrossFileCall` declines a `receiver.name()` call **because `name` resolves to a
type-level property / signal accessor with no function body**, do not fall through to
`unknown: true`. Instead tag the step `kind: "accessor-read"` (known) and trace the
**receiver** as the lineage (it already is, lines 2922–2931), so the path connects to the
prop/store/context boundary. Mirror `isOpaqueByDesignCall`'s "real step, not unknown"
treatment. Distinguish:

- receiver is a prop / `props.*` typed `() => T` → reactive prop read,
- receiver is a `createSignal`/`createStore`/`createMemo` accessor → signal read (the analyzer
  already models these in `registerVariable` for same-file; extend to the cross-object case),
- receiver is a context object method (`context.getModelName()`) → context boundary read.

> Expected: ~45 rows leave `unknown-edges` and surface (correctly) in prop-relay / context-relay
> instead. This is the single largest correctness win for the report's signal-to-noise.

### P7 — Bind custom render-prop & destructured callback params (Cause 3, ≈25 rows) — **BUG**

Extend `renderPropBinding` (line 2384):

1. **Array/object binding patterns.** When the matched param is an `ArrayBindingPattern`
   (`[key, value]`) or `ObjectBindingPattern`, bind each element to the element type of the
   `each` source (tuple/entries-aware: `Object.entries(x)` → `[string, V]`). Recovers `key`,
   `category`, `shortcuts`.
2. **Custom-component render-prop children.** When the host is a first-party component (not
   `For`/`Show`/`Index`) whose `children` prop is a `(item, index) => JSX.Element` callback,
   resolve the iterable from the component's own body (e.g. `ContextPanelRowList` renders
   `<For each={visibleItems()}>{props.children}</For>` over its `items` prop) or, cheaply, from
   the sibling JSX attribute conventionally named `items`/`each`/`rows`. Recovers `item` (12),
   `concept`, `relationship`, `field`. Also covers `ErrorBoundary fallback={(err)=>}` (Cause 5).

Add fixtures for a custom list component and a `<For each={Object.entries(x)}>{([k,v])=>}`.

### P8 — Classify factory/library/DOM calls (Cause 4, ≈22 rows) — **CLASSIFY**

- **DOM host methods:** extend `isOpaqueByDesignCall` / `JS_PROTOTYPE_METHODS` to recognize
  common DOM element methods (`getTotalLength`, `getPointAtLength`, `getBBox`, `getAttribute`,
  `setAttribute`, `getBoundingClientRect`, `getTotalSize`, …) — or, better, detect when the
  receiver's TS type is a DOM `*Element`/library handle and tag `kind: "host-call"`.
- **Library factories:** when `isFirstPartyDecl` declines a resolved callee (it lives in
  `node_modules`), tag `kind: "library-call"` with the package name instead of `unknown`.
- **First-party factory-produced callables:** for `const x = factory(...)`, do not chase the
  factory; tag `kind: "factory-callable"` (known boundary) once its symbol resolves (needs P5
  for `quantity`'s alias).

### P9 — Story / enum / global cleanups (Cause 5 remainder, ≈8 rows) — **LOW**

- Add `SVGElement`, `HTMLElement`, `Element`, `Node`, `Event`, `EventTarget`, `Text`,
  `Comment`, `DocumentFragment` to `JS_GLOBAL_NAMESPACES` (line 144).
- Trace imported `enum` values as `import` boundaries (`Emphasis`).
- Bind plain `.map`/`.sort`/`.filter` higher-order callback params to their iterable source
  (the prior plan's standing follow-up) — covers `left`, `right`, `phase`, `posData`, `icons`.
- Consider skipping render-sink tracing in `*.stories.tsx` (or binding CSF `render` args to the
  story's `args`), removing `args` (3) and the story-only `item` rows.

### Expected outcome

| After | Effect on the 131 |
| --- | --- |
| P5 | −27 (path-alias first-party helpers descend) |
| P6 | −45 (reactive reads reclassified; move to relay views) |
| P7 | −25 (render-prop / destructured callback params bound) |
| P8 | −22 reclassified to `host-call`/`library-call`/`factory-callable` (no longer `unknown`) |
| P9 | −8 (globals/enums/array-cb/story args) |
| **Net** | **`unknown-edges` approaches ~0 genuine unknowns**; remainder is honestly-labeled external/host/library boundaries, not failures. |

---

## Reproduce

```sh
# Full distinct set (markdown)
tsx-dataflow --root . --view unknown-edges --max-items 500 --out tmp/data-flow-unknown

# Prove the path-alias cause (Cause 1): the 8 railway-admin rows vanish under its own tsconfig
tsx-dataflow --root . --view unknown-edges --max-items 500 --file 'instance-details.tsx'                 # 8 unknown
tsx-dataflow --root client/apps/railway-admin --tsconfig client/apps/railway-admin/tsconfig.json \
             --view unknown-edges --max-items 500 --file 'instance-details.tsx'                          # 0 unknown
```

---

## Implementation results (2026-06-25)

All changes in `src/core.mjs`; 8 regression tests added in `test/core.test.mjs` (122 pass).
Modeler client `unknown-edges`: **131 → 16 distinct rows**, with `call`-kind rows going to **0**.

| Step | What landed | Running modeler count |
| --- | --- | --- |
| baseline | (after the prior plan's P0–P4) | 131 (94 call + 37 unknown-source) |
| **P6 + P8** | New `classifyUnresolvedCall(ts, checker, expression, crossFile)`: after cross-file descent declines a call, resolve the callee symbol's declarations. Declarations in a `.d.ts`/`node_modules` → `host-call`; a type-level property/parameter/signature/get-accessor with no body → `accessor-read`; a first-party `const x = factory(...)` → `factory-callable`. All flip `unknown:false`. A symbol with **zero declarations** (an import the program could not map) stays unknown — exactly the Cause-1 set. | 64 (27 call + 37 unknown-source) |
| **P7** | `renderPropBinding` generalized: `bindingCoversName` matches identifiers nested in array/object binding patterns (`([key, value]) => …`); custom components (capitalized tag) with a render-callback child bind their row param to a conventional iterable prop (`items`/`rows`/`each`/… via `iterableAttribute` + `RENDER_PROP_ITERABLE_ATTRIBUTES`). | 47 (27 call + 20 unknown-source) |
| **P9 (globals/enums/array-cb)** | DOM constructors (`SVGElement`, `HTMLElement`, `Element`, `Node`, `Event`, observers, …) added to `JS_GLOBAL_NAMESPACES`; `traceIdentifier` traces references to `enum`/`class`/`namespace` declarations as `literal`; new `arrayCallbackBinding` binds `.map`/`.filter`/`.sort`/… callback params to the receiver array. | 43 (27 call + 16 unknown-source) |
| **P5** | Per-config program routing: `buildProgramRouting` builds one `ts.Program` per tsconfig that declares `paths`, assigns each analyzed file to the most-specific such config, and `buildReport` traces each owned file with its **owner program's checker** so path-alias imports (`~/…`, `@app/*`) resolve. Catalog records carry their resolving checker (`record.checker`) so `buildHelperReport`/`enrichCatalogRecord` stay program-consistent. | **16 (0 call + 16 unknown-source)** |

### What the 16 residual rows are (correct to leave unknown)

- **Storybook CSF callback params (15)** — `item` (×10) and `args` (×3) in `*.stories.tsx`,
  passed as `args.children: (item) => …` / `render: (args) => …`, plus one `err`
  (`<ErrorBoundary fallback={(err) => …}>`) and one `prev` (a story state updater). These are
  story-fixture callbacks, not product render paths; binding them would mean modeling
  Storybook CSF. Reasonable to leave, or to skip render-sink tracing in `*.stories.tsx`.
- **Component-internal render arg (1)** — `posData` in `roundabout-node.tsx`, the parameter of
  `<TapestryNode>{(posData) => …}</TapestryNode>`, where `TapestryNode` computes the value
  internally and passes it to `props.children(posData)`. Resolvable only by descending into
  `TapestryNode`'s body to see what it feeds its children callback — a deeper follow-up.

### Performance

Per-config routing builds N extra programs (one per aliased config). On the modeler client this
took the full `unknown-edges` run from ~2.6s → ~5.6s (~2×), and `--view all` completes in ~5.5s
with no crash. The single-project case (no config declares `paths`) returns `routing = null` and
keeps the original single-program path, so non-monorepo runs are unchanged.

### Follow-ups (not done)

- Descend into custom components that compute their children-callback argument internally
  (recovers `posData`), by resolving `props.children(arg)` call sites in the component body.
- Optionally exclude `*.stories.tsx` render sinks (or bind CSF `render`/`args.children`), which
  would clear the remaining 15 story rows.
- `ErrorBoundary fallback={(err) => …}` is an attribute-callback, not a JSX child; extend the
  render-prop binder to attribute-position callbacks to bind `err`.
