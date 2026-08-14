# Project 4.1 Transformation Ledger Implementation Plan

**Date:** 2026-08-10

**Status:** Proposed and reviewed. Do not execute without approval.

**Approved direction:** Option D. Keep the broad route graph. Add exact,
demand-driven field proof through a compiler-backed transformation ledger.

**Parent plan:** [Project 4.1 field-to-component parity plan](20260808-project-4-1-field-to-component-parity-plan.md)

**Closure standard:** [Project 4.1 product closure retrospective](20260809-project-4-1-product-closure-retrospective.md)

## Outcome contract

### User action

The user completes this normal product journey:

1. Open Data trajectories.
2. Select the `/games/[gameId]` route.
3. Select `readFile(storePath(), "utf8")` in the Data source control.
4. Select Route totality.
5. Inspect the field path and component occurrences.

The feature cannot require a handcrafted URL or a hidden control.

### Primary positive fixture

- Project: `/Users/byronwall/Projects/soccer-schedule`
- Route: `/games/[gameId]`
- Selected origin: `readFile(storePath(), "utf8")`
- Origin location: `store-persistence.ts:93`
- Main route component: `GameDetailPage`

### Required visible result

The existing Route Totality graph stays visible. The selected source overlays
exact field traversal on that graph.

The graph and inspector must show these exact paths:

- `games[*].opponentName`
- `games[*].startsAt`
- `games[*].status`
- `games[*].id`
- `games[*].venueName`
- `games[*].venueAddress`

The view must show at least these exact target relationships:

| Field path | Required target and use |
| --- | --- |
| `games[*].opponentName` | `PageHeader` title |
| `games[*].startsAt` | `PageHeader` description |
| `games[*].status` | `Show` conditions and action visibility |
| `games[*].id` | Schedule link and delete handler |
| `games[*].venueName` | `PageHeader` description and `ScheduledGamePlanningDetails` |
| `games[*].venueAddress` | `ScheduledGamePlanningDetails` |
| `games[*].id` | `CompletedGameSummary` through the `gameId` prop alias |

Each atomic relationship below must have one exact occurrence and one exact
consumer. A count without the named records does not pass.

### Atomic positive obligations

These obligations define the closure set. The locations refer to the current
soccer fixture. Update a location only when the fixture source changes.

| ID | Source path | Consumer label | Kind | Owning occurrence | Field and consumer location |
| --- | --- | --- | --- | --- | --- |
| G01 | `games[*].status` | `PageHeader.eyebrow condition` | condition | `PageHeader` call at `GamePages.tsx:43` | `GamePages.tsx:44` |
| G02 | `games[*].opponentName` | `PageHeader.title` | render | `PageHeader` call at `GamePages.tsx:43` | `GamePages.tsx:45` |
| G03 | `games[*].startsAt` | `PageHeader.description date` | render | `PageHeader` call at `GamePages.tsx:43` | `GamePages.tsx:46` |
| G04 | `games[*].venueName` | `PageHeader.description venue` | render | `PageHeader` call at `GamePages.tsx:43` | `GamePages.tsx:52` |
| G05 | `games[*].status` | `Show.when build actions` | condition | `GameDetailPage` | `GamePages.tsx:55` |
| G06 | `games[*].id` | `A.href schedule` | render | `GameDetailPage` | `GamePages.tsx:64` |
| G07 | `games[*].status` | `Show.when edit action` | condition | `GameDetailPage` | `GamePages.tsx:71` |
| G08 | `games[*].id` | `deleteGame.id` | handler | `GameDetailPage` | `GamePages.tsx:80` |
| G09 | `games[*].status` | `Show.when completed branch` | condition | `GameDetailPage` | `GamePages.tsx:90` |
| G10 | `games[*].venueName` | `Text venue name` | render | `ScheduledGamePlanningDetails` call at `GamePages.tsx:93` | `ScheduledGamePlanningDetails.tsx:181` |
| G11 | `games[*].venueAddress` | `Text venue address` | render | `ScheduledGamePlanningDetails` call at `GamePages.tsx:93` | `ScheduledGamePlanningDetails.tsx:183` |
| G12 | `games[*].id` | `availability gameId condition` | condition | `ScheduledGamePlanningDetails` call at `GamePages.tsx:93` | `ScheduledGamePlanningDetails.tsx:23` |
| G13 | `games[*].id` | `markAllAvailable.gameId` | handler | `ScheduledGamePlanningDetails` call at `GamePages.tsx:93` | `ScheduledGamePlanningDetails.tsx:41` |
| G14 | `games[*].id` | `setAvailability.gameId` | handler | `ScheduledGamePlanningDetails` call at `GamePages.tsx:93` | `ScheduledGamePlanningDetails.tsx:100` |
| G15 | `games[*].id` | `schedule gameId condition` | condition | `CompletedGameSummary` call at `GamePages.tsx:172` | `CompletedGameSummary.tsx:23` |
| G16 | `games[*].id` | `availability gameId condition` | condition | `CompletedGameSummary` call at `GamePages.tsx:172` | `CompletedGameSummary.tsx:28` |
| G17 | `games[*].id` | `live gameId condition` | condition | `CompletedGameSummary` call at `GamePages.tsx:172` | `CompletedGameSummary.tsx:34` |
| G18 | `games[*].id` | `A.href live` | render | `CompletedGameSummary` call at `GamePages.tsx:172` | `CompletedGameSummary.tsx:139` |

G15 through G18 must include the compiler-proven `id -> gameId` alias at
`GamePages.tsx:172`. One alias record can support all four consumers.

The primary fixture passes only when G01 through G18 pass. A fixture source
change requires an explicit update to this table before closure.

### Required inspector result

For each named relationship, the inspector shows:

- the exact field path;
- the owning component occurrence;
- the consumer kind;
- the terminal or consumer label;
- the exact field-read location;
- the exact consumer location; and
- an action that opens the proof location.

The inspector must not show a full JSX expression as the terminal title. Use a
short semantic label. Put code and locations in the proof detail.

### Required persistence result

The selected source remains active while the user selects occurrences,
consumers, edges, and proof actions.

The normal source selection must work again after a page refresh. Existing URL
state can restore it. This plan does not add new URL fields.

### Small negative precision set

Positive proof is the main gate. Use only these clear negative checks:

- On `/login`, select `import.meta.env` and field `DEV`. Require one explicit
  frontier reason and location. Show no downstream field label.
- On `/games/[gameId]`, an unrelated field named `id` does not join the selected
  source path.
- The valid `/games/[gameId]/schedule` Route Totality payload still parses and
  renders after the contract change.
- Check one existing dynamic property access only when a stable example exists.
  It must stop with `dynamic-index` and no downstream green label.

Do not build a large negative fixture suite in this slice.

### Forbidden false positives

- Do not join values through equal field names.
- Do not attach a field to a shared component definition.
- Do not attach a field to every call of one component.
- Do not turn a consumer handoff green without exact field proof.
- Do not show a field after identity is lost.
- Do not use the old broad traversal as fallback proof.

### No-vacuous-pass rule

The primary fixture fails when any named relationship is absent.

The primary fixture also fails when any named relationship ends at a frontier.
Additional unsupported paths can end at explicit frontiers.

Zero attachments, one root field, or one generic render terminal cannot pass.

## Baseline and problem statement

The broad selected-source graph already has useful route coverage:

- 460 exact selected-source paths;
- 45 terminals;
- 6 components; and
- 938 whole-route trajectories with 185 terminals.

These figures are baseline evidence. Compare their semantic records during
implementation. Do not require exact count equality after a justified analyzer
change.

The current narrow field result is not a product result:

- status is `partial`;
- it has four attachments and 20 frontiers;
- it exposes `games` and `games.find` as labels;
- the UI shows one `games` field on one occurrence; and
- it ends at one generic render expression.

The current proof loses identity at `.find()`. It also loses the selected game
through the `Show` render callback. It cannot prove nested reads, exact component
props, direct scalar prop aliases, conditions, or handlers.

The broad graph is not the error. The error is using broad reachability as a
substitute for exact field transformations.

## Product requirements and technical assumptions

### Product requirements

- Preserve the useful existing Route Totality graph.
- Overlay field traversal on that graph.
- Prove every named static selected-game use in the primary fixture.
- Show exact paths, occurrences, consumers, and proof locations.
- Keep consumer handoffs separate from field transformations.
- Fail closed when identity is missing, partial, or ambiguous.
- Preserve broad route coverage.
- Use the normal source picker.
- Verify the result in the browser.

### Fixed technical assumptions

- TypeScript compiler symbols and source spans can identify the required syntax.
- `Array.prototype.find` and Solid `Show` need explicit transfer functions.
- A direct JSX scalar prop can prove an alias without a name-based join.
- Conditions and handlers need occurrence-owned consumer records.
- The existing occurrence and terminal anchor index remains reusable.
- The API keeps the `fieldLineage` name during migration.

If an assumption is false, stop the affected task. Return evidence to the
orchestrator. Do not invent a weaker name-based rule.

## Scope

### Superseded parent decisions

This plan supersedes two decisions in the 2026-08-08 parent plan:

- Project 4.1 now uses the existing Data source picker to activate field proof.
- Existing `sourceMethod` URL state restores that picker after refresh.

Project 4.2 can still unify other source and selection state. It does not own
the minimum activation path required by this plan.

This plan also supersedes the parent rule that all prop renames stop. A direct
scalar JSX prop alias now preserves identity when compiler proof is exact.

### Supported transformation set

This slice supports only:

- selected source carrier;
- static property read;
- `Array.prototype.find` element binding;
- callback parameter binding;
- one exact function return;
- Solid `Show` render-prop binding;
- nested static property read;
- exact JSX component prop binding;
- direct scalar JSX prop alias;
- occurrence-owned render consumption;
- occurrence-owned condition consumption; and
- occurrence-owned handler or action consumption.

Completeness means complete for this declared set.

### Deferred work

- `.map`, `.filter`, `.reduce`, and other collection transforms
- destructuring and destructuring renames
- object packing and unpacking history
- object and JSX spreads
- mutation history
- derived value lineage
- complete formatter lineage
- conditional multi-origin alternatives
- arbitrary framework render props
- full shape transformations
- full Project 6 type flow

Unsupported syntax creates a frontier. It does not create a guessed path.

## Architecture

### Two layers with different authority

```text
broad route graph
  candidate reachability, route membership, occurrences, terminals, handoffs

selected origin + route
  -> demand-driven exact query
  -> compiler-backed transformation ledger
  -> exact field attachments and frontiers
  -> Route Totality overlay and inspector
```

The broad graph answers where proof can look. The ledger answers which field
identity survives.

Do not change broad graph semantics to make field proof pass.

### Current modules to keep

- `src/analysis/evidence-slice.ts`
- `src/analysis/evidence-relation-provider.ts`
- `src/analysis/route-totality-bridge.ts`
- `src/analysis/route-totality-selected-source.ts`
- `src/analysis/route-totality-anchor-index.ts`
- `src/analysis/route-data-totality.ts`
- the current Route Totality contract, projection, graph, and inspector shells

Keep `buildRouteTotalityBridges()` broad. Keep handoffs in their current
projection.

### Current modules to replace after migration

Replace the proof policy in these modules:

- `src/analysis/route-totality-field-lineage.ts`
- `src/analysis/route-totality-field-lineage-transition.ts`
- `src/analysis/route-totality-field-lineage-traversal.ts`
- `src/analysis/route-totality-field-lineage-transition-advance.ts`
- `src/analysis/route-totality-field-lineage-component-binding.ts`
- `src/analysis/route-totality-field-lineage-target-field.ts`

Keep reusable result, attachment, frontier, count, and truncation helpers when
their contracts still match.

### New focused analyzer modules

Use these ownership boundaries. A worker can refine a filename. It cannot merge
these responsibilities into one large module.

| Module | Responsibility |
| --- | --- |
| `route-totality-field-proof-types.ts` | Analyzer-only identities, path segments, transformations, query state, and metrics |
| `route-totality-field-proof-index.ts` | Compiler identity and candidate indexes for one route generation |
| `route-totality-field-proof-query.ts` | Demand-driven worklist, visited keys, bounds, and result assembly |
| `route-totality-field-proof-property.ts` | Static and nested property reads |
| `route-totality-field-proof-find.ts` | `.find` receiver, callback, predicate, element, and result binding |
| `route-totality-field-proof-return.ts` | Expression and single-block return transfers |
| `route-totality-field-proof-show.ts` | Solid `Show` `when` and render-prop transfer |
| `route-totality-field-proof-component.ts` | Exact JSX prop and direct scalar alias transfers |
| `route-totality-field-proof-consumer.ts` | Render, condition, and handler consumption |
| `route-totality-field-proof-frontier.ts` | Fail-closed stop records and cap handling |
| `route-totality-field-proof-result.ts` | Stable sorting, counts, omissions, and compatibility projection |

Keep each module below 300 lines when practical. Extract before 400 lines.

## Exact domain contracts

The implementation must use equivalent contracts. Renaming a type is allowed.
Weakening an invariant is not allowed.

### Compiler identity

```typescript
type CompilerIdentity = {
  id: string;
  kind:
    | "expression"
    | "binding"
    | "parameter"
    | "call"
    | "property-read"
    | "component-occurrence"
    | "consumer";
  source: SourceLocation;
  symbolId: string | null;
  programElementId: string | null;
};
```

Rules:

- Use compiler symbol identity when a symbol exists.
- Use source span, semantic kind, and role for expression identity.
- Add the exact call site to component occurrence identity.
- Add the owner occurrence to consumer identity.
- Do not use a display label as identity.
- Do not use a component definition as an occurrence identity.

### Field path

```typescript
type FieldPathSegment =
  | { kind: "property"; value: string }
  | { kind: "collection-element"; value: "*" }
  | { kind: "string-index"; value: string }
  | { kind: "numeric-index"; value: string };
```

Formatting rules:

- Properties use `games.status`.
- Collection elements use `games[*]`.
- String indexes use `items["name"]`.
- Numeric indexes use `items[0]`.
- `.find` is a transformation. It is not a path segment.
- `current`, `props`, `game`, and `gameId` are aliases. They are not source
  field segments.

### Exact field identity

```typescript
type ExactFieldIdentity = {
  elementIds: string[];
  segments: FieldPathSegment[];
  label: string;
  lastRead: CompilerIdentity;
  status: "exact";
};
```

Field state is monotonic:

```text
absent -> exact -> lost
```

Lost identity never resumes. A later equal name starts separate evidence.

### Transformation record

```typescript
type FieldTransformationKind =
  | "source-carrier"
  | "property-read"
  | "find-element"
  | "callback-parameter"
  | "function-return"
  | "show-render-prop"
  | "nested-property-read"
  | "jsx-component-prop"
  | "scalar-alias"
  | "occurrence-consumer";

type FieldTransformation = {
  id: string;
  kind: FieldTransformationKind;
  from: CompilerIdentity;
  to: CompilerIdentity;
  fieldBefore: ExactFieldIdentity | null;
  fieldAfter: ExactFieldIdentity | null;
  effect:
    | "preserve"
    | "append-property"
    | "append-collection-element"
    | "bind-parameter"
    | "bind-occurrence"
    | "consume";
  proof: EvidenceProof[];
  locations: SourceLocation[];
  status: "proven";
};
```

The ledger stores one record for each accepted semantic transfer. It never
stores an inferred or partial transfer.

### Consumer record

```typescript
type FieldConsumerKind = "render" | "condition" | "handler";

type FieldConsumer = {
  id: string;
  kind: FieldConsumerKind;
  label: string;
  identity: CompilerIdentity;
  occurrenceId: string;
  routeTerminalId: string | null;
  location: SourceLocation;
};
```

A condition or handler can lack an existing render-terminal ID. It still needs
one exact consumer identity and one occurrence owner. Do not create a fake
render terminal.

### Frontier

```typescript
type FieldProofFrontier = {
  id: string;
  phase: "carrier" | "field";
  origin: { elementId: string; role: OriginRole };
  field: ExactFieldIdentity | null;
  current: CompilerIdentity | null;
  occurrenceId: string | null;
  candidateTargetIds: string[];
  reason:
    | "partial-proof"
    | "missing-compiler-identity"
    | "unsupported-relation"
    | "unsupported-transform"
    | "ambiguous-target"
    | "dynamic-index"
    | "multiple-origins"
    | "cycle"
    | "evidence-truncated"
    | "unmapped-occurrence"
    | "unmapped-consumer";
  transformationIds: string[];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  location: SourceLocation | null;
  proof: EvidenceProof[];
};
```

A carrier frontier can have `field: null`. This makes source-to-field failure
visible without inventing a field.

### Query state and result

```typescript
type FieldProofQuery = {
  routeKey: string;
  generation: string;
  origin: { elementId: string; role: OriginRole };
  policyVersion: string;
};

type FieldProofQueryState = {
  current: CompilerIdentity;
  field: ExactFieldIdentity | null;
  occurrenceId: string | null;
  transformationIds: string[];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  componentReceiverId: string | null;
  showRenderPropId: string | null;
  depth: number;
};

type FieldProofQueryResult = {
  status: "complete" | "partial" | "unavailable";
  unavailableReason: string | null;
  transformations: FieldTransformation[];
  attachments: RouteTotalityFieldAttachment[];
  frontiers: FieldProofFrontier[];
  counts: {
    origins: number;
    fields: number;
    occurrences: number;
    consumers: number;
    transformations: number;
    frontiers: number;
  };
  omissions: string[];
  metrics: FieldProofMetrics;
};
```

The analyzer keeps compiler identities and the full ledger. The API exposes
compact transformation IDs, kinds, labels, and proof locations. It does not
expose raw compiler symbols.

## Demand-driven query

### Activation

1. Build the normal route evidence slice.
2. Build broad bridges without field-policy changes.
3. Resolve the selected source to one exact origin.
4. Create or reuse the route-generation proof index.
5. Run the field query only for that route and origin.
6. Map exact consumers through the route anchor index.
7. Project the result into `RouteTotalityRecord.fieldLineage`.

Do not compute all origins during route analysis.

### Source-picker activation integration

Use the existing state path. Do not create a second source selection:

```text
DataTrajectoryDialog.selectSource(sourceMethodKey)
  -> TrajectoryUrlState.source
  -> serialize as sourceMethod URL parameter
  -> parse sourceMethod back into TrajectoryUrlState.source
  -> RouteTrajectoryWorkspace.selectedSourceEvidence
  -> exactRouteTotalityOriginForSource()
  -> field proof query origin
  -> active field focus
```

Fixed ownership:

- `DataTrajectoryDialog.tsx` owns the visible picker event.
- `trajectory-url-state.ts` owns `sourceMethod` parse, serialize, and refresh.
- `RouteTrajectoryWorkspace.tsx` resolves the selected source evidence record.
- `route-totality-source-focus.ts` maps exact source evidence to one origin.
- `RouteTotalityGraph.tsx` reconciles active field focus with the payload.

`TrajectoryUrlState.source` is the in-memory field. `sourceMethod` is its URL
parameter name. Parse and serialization must keep this one-to-one mapping.

Rules:

- Selecting a source clears stale graph selection and camera state as it does
  today. It does not require selecting an origin node.
- The mapper requires the selected source key, exact evidence location, and one
  matching origin element and role.
- Zero matches show one activation frontier or unavailable message.
- More than one match shows `ambiguous-target` and activates no field focus.
- Selecting occurrences, consumers, edges, or proof actions preserves source
  and field focus.
- A route change clears the source when that route does not contain it.
- A refresh restores `sourceMethod`, resolves new-generation evidence, and
  creates a new origin identity. It never reuses a stale element ID.

Task 1 owns this complete path. The browser gate must start from the visible
picker. A handcrafted URL can reproduce the state, but cannot be the only
working activation method.

### Candidate restriction

The proof index can read compiler facts outside the materialized slice only to
validate one candidate transfer attached to the selected route. It cannot add
broad reachability.

Each accepted consumer must map back to the route occurrence surface. Reject
off-route consumers.

### Worklist and visited key

Use a breadth-first worklist. Prefer the shortest canonical proof.

The visited key is:

```text
origin ID and role
+ current compiler identity
+ occurrence ID
+ field element ID chain
+ component receiver ID
+ Show render-prop ID
```

On duplicate target attachments, keep the path with fewer transformations.
Break ties by the joined transformation IDs.

### Bounds

Use explicit constants for:

- maximum states;
- maximum depth;
- maximum transformations;
- maximum attachments;
- maximum frontiers; and
- maximum compiler candidate resolutions.

Reuse cancellation checks before and during all bounded loops and sorts.

Exceeding a bound creates a concrete omission and a frontier at the last exact
state. It does not return `complete`.

## Transfer functions

### Canonical fixture chain

Every G01 through G18 proof begins with this exact chain. Each row requires one
compiler identity. An absent or ambiguous row creates a frontier.

| Step | From | Required transfer | To | Path effect |
| --- | --- | --- | --- | --- |
| C01 | selected `readFile` origin | source carrier | parsed snapshot identity | none |
| C02 | snapshot identity | static property read | `data.snapshot()?.games` at `GamePages.tsx:23` | append `games` |
| C03 | exact `games` expression | resolved `Array.prototype.find` receiver | find call | append `[*]` |
| C04 | find callback | compiler parameter binding | `item` symbol | preserve |
| C05 | `item` symbol | exact predicate use and predicate return | find predicate | preserve |
| C06 | find call | exact call result | `game` accessor expression result | preserve |
| C07 | `game` accessor expression | exact function return | `game()` call at `GamePages.tsx:40` | preserve |
| C08 | `game()` call | `Show.when` binding | outer `Show` at `GamePages.tsx:40` | preserve |
| C09 | outer `Show` | direct render callback parameter | `current` symbol at `GamePages.tsx:41` | preserve |
| C10 | `current` symbol | accessor call identity | each `current()` receiver | preserve |
| C11 | exact `current()` receiver | nested property read | named field read | append property |
| C12 | named field or whole value | component, alias, or consumer transfer | exact occurrence-owned consumer | preserve or consume |

Do not skip C06 or C07 through a generic same-function rule. The accessor
declaration, return expression, call expression, and `Show.when` expression
must each have exact identity.

The G10 through G14 chain adds the exact whole-object JSX binding at
`GamePages.tsx:93`. The G15 through G18 chain adds the exact scalar JSX alias at
`GamePages.tsx:172`.

### Selected source carrier

Reuse `mergeSelectedRouteSource()` only to identify the selected origin and its
first exact route candidate.

Record each accepted carrier step. Do not treat it as a field transformation.
If the carrier is missing or ambiguous, create a carrier frontier.

### Static property read

Accept when all conditions are true:

1. The compiler identity of the receiver equals the current value identity.
2. The property name is static.
3. The property-read fact is proven and located.
4. Exactly one candidate connects the receiver to the read.
5. The expression is not computed or optional.

Append one property segment. The first fixture step is `games`.

### `Array.prototype.find` element binding

For `games.find((item) => item.id === params.gameId)`, require:

1. The call resolves to the compiler-known `Array.prototype.find` signature.
2. The receiver is the exact `games` identity.
3. There is one callback argument.
4. The callback has one exact parameter.
5. The predicate reads from that parameter symbol.
6. The predicate has one exact return path.
7. The call result has one exact value identity.

Emit these transfers:

```text
games
  -> games[*]
  -> callback parameter item
  -> find call result
```

Append `collection-element` exactly once. Never emit `games.find`.

### Callback parameter binding

Accept only when the declaration and use have the same compiler symbol.

Reject destructuring, rest parameters, optional parameters, unresolved
callbacks, and multiple callback candidates.

### Function return

Support:

- one expression-bodied arrow or function; and
- one block with one exact returned value.

Multiple different returns create `multiple-origins`. Identical compiler
identity on all reachable returns can preserve the value.

The `game` accessor return must preserve `games[*]`.

### Solid `Show` render-prop binding

For `<Show when={game()}>{(current) => ...}</Show>`, require:

1. The tag resolves to `Show` from `solid-js`.
2. There is one static `when` attribute.
3. The `when` value is the exact `game()` call.
4. There is one direct render callback.
5. The callback has one exact parameter.
6. `current()` resolves to that parameter symbol.

Preserve `games[*]` through `current()`. Do not append `current`.

### Nested property read

Require the exact `current()` identity as the receiver. Append only the static
domain property.

Examples:

- `games[*].status`
- `games[*].opponentName`
- `games[*].startsAt`
- `games[*].venueName`
- `games[*].venueAddress`
- `games[*].id`

### JSX component prop binding

For `<ScheduledGamePlanningDetails game={current()} />`, require:

1. The tag resolves to one in-project function component.
2. The attribute is one static JSX attribute.
3. The value is the exact current identity.
4. The occurrence anchor is unique.
5. The component parameter is unique.
6. The component receiver is rooted in that parameter symbol.
7. The receiver belongs to the resolved component definition.

Preserve the value across the prop. Do not append `game` or `props`.

Consumer handoff evidence stays separate and blue.

### Direct scalar JSX prop alias

For `<CompletedGameSummary gameId={current().id} />`, require the same exact
component conditions plus exact identity for `current().id`.

Record a `scalar-alias` transformation:

```text
games[*].id -> props.gameId
```

Keep `games[*].id` as the source path label. Show `gameId` as alias metadata.

This is compiler-proven value binding. It is not an equal-name join.

Reject object reconstruction, spreads, destructuring aliases, and computed
props.

### Occurrence-owned consumer

Support three consumer kinds:

- `render` for visible JSX values and attributes;
- `condition` for `Show`, ternary, and direct boolean conditions; and
- `handler` for values used by event handlers or action arguments.

Accept only when:

1. The field identity is exact.
2. The consumer has one compiler identity and source location.
3. The consumer maps to one route occurrence.
4. The mapped occurrence equals the current occurrence.
5. The consumer is not owned only by a shared definition.

Use short labels such as `PageHeader.title`, `Show.when`, `A.href`, and
`Button.onClick`. Do not use the full JSX source as the UI label.

For the primary fixture, the consumer collector must emit G01 through G18 by
the exact expression spans in the atomic obligation table. A broad scan of all
uses in a component or definition is not accepted proof.

For a JSX prop, use the attribute value expression span as the consumer span.
For a condition, use the condition expression span. For a handler, use the
exact field expression passed to the handler action. The occurrence anchor is
mandatory in every case.

## Deterministic IDs

Use `stableHash()` with these semantic tuples:

```text
compiler identity:
  semantic kind + source span + symbol identity + role

transformation:
  kind + from identity + to identity + proof locations

attachment:
  origin + field element chain + occurrence + consumer

frontier:
  origin + field chain + current identity + occurrence + reason

query cache:
  route key + generation + origin identity + policy version
```

Never use array positions, labels, component names, or definition IDs alone.

Sort every emitted array by stable semantic ID.

## API and validation

### Compatibility strategy

Keep `RouteTotalityRecord.fieldLineage`. Extend it additively during migration.

Add:

- `collection-element` path segments;
- compact transformation references;
- consumer kind and label;
- alias metadata;
- carrier-phase frontiers with `field: null`;
- transformation count; and
- optional diagnostic metrics outside the normal browser payload.

The full compiler ledger stays in the analyzer domain.

### Exact transport shape

Use this additive DTO shape for each attachment:

```typescript
type RouteTotalityFieldAttachmentDto = {
  id: string;
  origin: { elementId: string; role: OriginRole };
  field: {
    elementIds: string[];
    segments: FieldPathSegmentDto[];
    label: string;
    location: SourceLocationDto;
  };
  occurrenceId: string;
  consumer: {
    id: string;
    kind: "render" | "condition" | "handler";
    label: string;
    routeTerminalId: string | null;
    location: SourceLocationDto;
  };
  alias: {
    from: string;
    to: string;
    location: SourceLocationDto;
  } | null;
  transformationIds: string[];
  transformationKinds: FieldTransformationKind[];
  evidencePathElementIds: string[];
  evidencePathRelationIds: string[];
  proof: EvidenceProofDto[];
  locations: SourceLocationDto[];
};
```

Use one attachment per exact origin, field chain, occurrence, and consumer.
Keep `routeTerminalId: null` for exact conditions and handlers that are not
existing render terminals.

Project transformations as references only. The frontend cannot infer a
consumer, alias, or field path from labels or evidence relations.

Example for G15:

```typescript
{
  field: { label: "games[*].id", segments: [
    { kind: "property", value: "games" },
    { kind: "collection-element", value: "*" },
    { kind: "property", value: "id" },
  ] },
  occurrenceId: "<CompletedGameSummary call-site occurrence ID>",
  consumer: {
    kind: "condition",
    label: "schedule gameId condition",
    routeTerminalId: null,
    location: "CompletedGameSummary.tsx:23",
  },
  alias: {
    from: "id",
    to: "gameId",
    location: "GamePages.tsx:172",
  },
  transformationKinds: [
    "property-read",
    "find-element",
    "callback-parameter",
    "function-return",
    "show-render-prop",
    "nested-property-read",
    "scalar-alias",
    "occurrence-consumer",
  ],
}
```

The example omits required IDs and proof arrays only for readability. The Zod
contract requires them.

Projection ownership:

- `route-totality-field-lineage-contracts.ts` owns the strict DTO schemas.
- `projections/route-totality-field-lineage.ts` maps analyzer records.
- `route-totality-field-lineage-validation*.ts` validates semantic references.
- `contracts.ts` re-exports only the inferred transport types.

### Validation rules

Strict validation must reject:

- unknown or duplicate identities;
- duplicate transformation, attachment, frontier, or consumer IDs;
- labels that do not match canonical segments;
- `.find` represented as a property segment;
- alias names represented as source field segments;
- discontinuous transformation paths;
- a transformation with partial proof;
- a consumer outside its occurrence;
- a definition ID used as an occurrence ID;
- a field after a frontier;
- a named primary relationship that maps to a frontier in closure evidence;
- an off-route consumer;
- an equal-name join without compiler identity; and
- `complete` status with frontiers, caps, or omissions.

Use the same transfer classifier or proof verifier in traversal and validation.
Do not maintain two policy tables.

## Frontend contract

### Existing graph is the visual base

Do not create a second graph or a separate field-only layout.

Reuse the current Route Totality node positions, occurrence structure, hidden
node redirects, camera, and selection.

### Prior-art parity

| Product behavior | Existing authority | Required reuse |
| --- | --- | --- |
| Proven source path | Component topology source lens | Solid green path and participating marks |
| Field label | Component topology nodes | Green monospace compact label |
| Field inspector | Component topology inspector | Pale-green structured field rows |
| Selected item | Route Totality | Existing blue selection and focus treatment |
| Consumer handoff | Route Totality | Existing blue dashed handoff |
| Stopped proof | Route Totality | Existing amber dashed frontier |
| Graph layout | Route Totality | Current richer occurrence graph and camera |

### Graph rules

- Green edges come only from exact ledger transformations.
- Green marks come only from exact participating occurrences and consumers.
- Consumer-only handoffs remain blue and dashed.
- Frontiers remain amber and dashed.
- Non-participants use the current dimming treatment.
- Field focus cannot change node positions.
- Show at most three field labels on a node, then `+N`.
- Keep the full list in the inspector.
- Keep records on original occurrence IDs after display redirects.

### Inspector rules

Title the section `Source fields through this occurrence`.

Use aligned rows with these columns:

```text
Field path | Consumer | Alias | Proof location
```

Show alias only when present. Use `id -> gameId` for the approved scalar alias.

Group multiple consumers under one field path. Do not repeat a field row for
every internal proof step.

Put transformations behind one compact `Proof steps` action. Keep the main
inspector scannable.

Show `Field continuity stopped` separately. Never mix a frontier into a proven
field row.

### No new mock requirement

This UI uses approved prior art. It needs no ImageGen work.

Stop and request a high-fidelity mock before adding:

- selectable field nodes;
- a transformation timeline;
- multiple-origin comparison;
- a new source picker;
- a field minimap; or
- a separate rename or packing visualization.

## Performance and instrumentation

Performance is a soft first-slice gate. Measure and report it.

Record:

- query count and cache hits;
- states queued and expanded;
- provider relation requests;
- compiler identity resolutions;
- transformations by kind;
- frontiers emitted and omitted;
- maximum depth;
- collection, query, mapping, validation, and projection time; and
- ledger and API payload sizes.

Reference targets:

- less than 500 ms for a warm selected route; and
- less than 5 seconds for the first query after workspace analysis.

Do not fail the first slice for a small miss. Stop when the query is unbounded,
blocks normal interaction, or gets slower on each repeated selection.

## Migration and rollback

1. Add the new ledger beside the current field traversal.
2. Keep old output available only for diagnostic comparison.
3. Run both paths for the primary fixture during development.
4. Compare exact semantic attachments, consumers, and frontiers.
5. Never merge old output into new output.
6. Never use old output to satisfy a missing named relationship.
7. Switch `fieldLineage` to the new query after the positive gate passes.
8. Remove the old traversal policy in a separate cleanup task.

The rollback is to keep the old projection active. Do not change broad graph
or bridge semantics during rollback.

## Implementation tasks

Each task uses the closure template from the retrospective.

### Task 1 — Outcome: first vertical proof

**Outcome:** Prove `games[*].opponentName` from the selected source to the
`PageHeader.title` consumer. Show it on the current graph and in the inspector.

**Fixture:** Primary soccer fixture.

**User action:** Use the normal route and source controls.

**Visible evidence:** Green path, `games[*].opponentName`, `PageHeader.title`,
and exact proof locations.

**Analyzer evidence:** Source carrier, `games` property, `.find` element,
callback binding, function return, `Show` binding, nested property, component
prop, and occurrence consumer.

**Forbidden false positives:** No `games.find` label. No definition attachment.
No equal-name join.

**Files owned:**

- minimal new `route-totality-field-proof-*.ts` modules;
- required targeted collector or fact-index files;
- `route-data-totality.ts` integration;
- minimal additive API contract and projection;
- field model, graph marks, and inspector field section;
- `DataTrajectoryDialog.tsx` only if its current source event needs repair;
- `trajectory-url-state.ts` only if `sourceMethod` restore needs repair;
- `RouteTrajectoryWorkspace.tsx` selected-source resolution;
- `route-totality-source-focus.ts`; and
- `RouteTotalityGraph.tsx` source-to-field-focus reconciliation.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Complete the normal user action. Open the proof location.
Refresh. Repeat through visible controls.

**Completion evidence:** Before and after screenshot, named DTO record, named
consumer, proof locations, static results, console result, and timing.

This task cannot close with infrastructure only.

### Task 2 — Enabling: stabilize ledger primitives

**Outcome:** Extract the first slice into focused identity, index, query,
frontier, and result modules. Add bounds, cancellation, stable IDs, and metrics.

**Fixture:** The Task 1 result must remain unchanged.

**User action:** Same as Task 1.

**Visible evidence:** No visible regression.

**Analyzer evidence:** Deterministic result from two repeated queries in one
generation. Cache key includes route, generation, origin, and policy.

**Forbidden false positives:** No old/new result merge. No broad graph changes.

**Files owned:** New analyzer proof modules only.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Repeat the Task 1 journey once.

**Completion evidence:** Module ownership map, metrics sample, stable semantic
record comparison, and static results.

This enabling task cannot close Project 4.1.

### Task 3 — Outcome: complete direct route uses

**Outcome:** Complete G01 through G09. Add exact paths for `startsAt`, `status`,
`id`, and `venueName` in `GameDetailPage`.

**Fixture:** Primary soccer fixture.

**User action:** Same normal source selection.

**Visible evidence:** All six unique field labels appear. The inspector groups
their named consumers.

**Analyzer evidence:** Nested property and render, condition, and handler
consumer transformations.

**Forbidden false positives:** No unrelated route, `id`, context, or consumer.

**Files owned:** Property, `Show`, return, and consumer proof modules. Add only
the required collector facts.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Inspect `PageHeader`, the status conditions, schedule link,
and delete handler.

**Completion evidence:** G01 through G09 with one proof chain for each use.

### Task 4 — Outcome: whole-object component handoff

**Outcome:** Complete G10 through G14. Preserve `games[*]` through
`ScheduledGamePlanningDetails game={current()}`. Prove its `venueName` and
`venueAddress` reads, its `id` reads, and their consumers.

**Fixture:** Primary soccer fixture.

**User action:** Select the `ScheduledGamePlanningDetails` occurrence.

**Visible evidence:** The occurrence shows `games[*].venueName`,
`games[*].venueAddress`, and `games[*].id`. The consumer handoff stays separate.

**Analyzer evidence:** One exact JSX occurrence binding, component parameter
binding, nested reads, and occurrence-owned consumers.

**Forbidden false positives:** Do not attach to other calls of the definition.
Do not append `game` or `props` to the source path.

**Files owned:** Component proof module and targeted component-binding facts.
The generic DTO and UI from Task 1 must carry these records without a contract
change.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Select the exact occurrence and open both proof locations.

**Completion evidence:** G10 through G14, exact call site, exact component
receiver, consumers, and separate handoff record.

### Task 5 — Outcome: direct scalar alias

**Outcome:** Complete G15 through G18. Prove `games[*].id` through the `gameId`
prop into `CompletedGameSummary`.

**Fixture:** Primary soccer fixture.

**User action:** Select the `CompletedGameSummary` occurrence.

**Visible evidence:** The row shows `games[*].id`, alias `id -> gameId`, the
occurrence, and consumer proof.

**Analyzer evidence:** Exact nested read, exact JSX prop value, scalar alias,
component parameter receiver, and occurrence consumer.

**Forbidden false positives:** Do not join another `id`. Do not treat `gameId`
as a source field segment.

**Files owned:** The same component proof owner as Task 4. Add scalar-alias
behavior to that module. Use the generic alias DTO and UI from Task 1.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Open the exact call site and child consumer proof.

**Completion evidence:** G15 through G18 share one continuous alias chain. No
named use has an alias frontier.

### Task 6 — Enabling: strict API cutover and old-policy removal

**Outcome:** Make the ledger query the only source for `fieldLineage`. Remove
the old field traversal after semantic comparison passes.

**Fixture:** Primary fixture plus broad route baseline.

**User action:** Same normal user journey.

**Visible evidence:** No visible regression.

**Analyzer evidence:** New projection passes strict validation. Broad bridges
keep their semantic occurrences and terminals.

**Forbidden false positives:** No fallback, union, or hidden old result.

**Files owned:** Route integration, old traversal files, API contracts,
projection, and validation.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Repeat the full positive journey after cutover.

**Completion evidence:** Semantic before/after broad graph report, API status,
and proof that the old result is not active.

This enabling task cannot close Project 4.1.

### Task 7 — Outcome: finish product presentation

**Outcome:** Make the full positive result easy to scan on the existing graph.

**Fixture:** Primary soccer fixture.

**User action:** Select the origin and inspect all three target occurrences.

**Visible evidence:** Compact green paths, readable field labels, aligned field
rows, short consumer labels, proof actions, and separate amber stops.

**Analyzer evidence:** UI records match exact ledger records by ID.

**Forbidden false positives:** No full JSX terminal title. No layout change from
field focus. No green consumer-only handoff.

**Files owned:** Frontend field models, graph marks, inspector section, controls,
and focused CSS.

**Static checks:** `pnpm lint` and `pnpm typecheck`.

**Browser checks:** Compare against the current component topology source-lens
prior art. Check graph camera, selection, refresh, proof links, and console.

**Completion evidence:** Side-by-side screenshots and the full product matrix.

### Task 8 — Verification: positive clean-room gate

**Outcome:** A separate browser worker proves the complete user journey.

**Fixture:** Primary soccer fixture.

**User action:** Start from Data trajectories. Use only visible controls.

**Visible evidence:** Every named path, occurrence, consumer, and proof action.

**Analyzer evidence:** Record the matching compact DTO records only after the
black-box browser pass.

**Forbidden false positives:** No coaching through hidden controls. No source
inspection before the browser journey unless blocked.

**Files owned:** None.

**Static checks:** Confirm the final implementation worker ran lint and
typecheck. The verifier does not change files.

**Browser checks:** Use the script in the proof section below.

**Completion evidence:** Completed closure report. Any failed named outcome
returns to its implementation owner. Repeat with a fresh verifier.

### Task 9 — Verification: small precision and regression gate

**Outcome:** Confirm the small negative set and broad graph preservation.

**Fixture:** Primary fixture, `/login` with `import.meta.env` and `DEV`,
`/games/[gameId]/schedule`, and one existing dynamic access when available.

**User action:** Select each origin through normal controls.

**Visible evidence:** `/login` has one clear stop and no downstream `DEV` label.
The schedule route renders a valid Route Totality payload. No unrelated green
labels appear. Dynamic access has one clear stop when checked. Broad route
content remains available when field focus clears.

**Analyzer evidence:** No off-route or equal-name attachment. Broad semantic
records remain present.

**Forbidden false positives:** Do not turn missing positive output into a
negative success.

**Files owned:** None unless the orchestrator assigns a focused repair.

**Static checks:** No new checks.

**Browser checks:** Bounded negative and broad graph checks only.

**Completion evidence:** Small negative table and broad semantic comparison.

## Work sequencing and parallel work

Task 1 runs first. It fixes the contracts through one vertical result.

After Task 1, these work streams can run in parallel with fixed contracts:

- Task 3: direct route consumers
- Task 2: stable ledger extraction
- Tasks 4 and 5: one component-boundary worker, in sequence

Task 1 owns the generic transport contract and frontend record shape. Tasks 3
through 5 must fit that contract. They do not edit API schemas or generic field
UI during parallel work.

Task 3 owns property, `Show`, return, and consumer proof modules.

One worker owns the component proof module for Tasks 4 and 5. It completes the
whole-object transfer before the scalar alias.

Task 2 owns identity, index, query, bound, metric, and result modules. It does
not change transfer semantics.

Task 6 is the only post-merge API and route integration owner. Task 7 is the
only post-merge frontend presentation owner.

Tasks 6 and 7 run after Tasks 2 through 5 merge.

Tasks 8 and 9 run after implementation. Task 8 uses a clean browser context.

## Browser proof script

Use a separate clean-room worker. Give it the product goal, route, source, and
acceptance matrix. Do not give it a source-code walkthrough.

Start the product with:

```bash
pnpm dev -- --root /Users/byronwall/Projects/soccer-schedule
```

Then complete these checks:

1. Open Data trajectories from the normal application entry.
2. Select `/games/[gameId]`.
3. Select `readFile(storePath(), "utf8")` from Data source.
4. Select Route totality.
5. Confirm the current richer route graph remains visible.
6. Confirm green field paths overlay that graph.
7. Confirm all six unique exact path labels.
8. Select `PageHeader`.
9. Confirm `opponentName`, `startsAt`, `venueName`, and named consumers.
10. Confirm the Data source control and field-focus block still show the exact
    `readFile` source.
11. Select the `GameDetailPage` occurrence.
12. Confirm `status` conditions and `id` link or handler consumers.
13. Confirm source and field focus remain active.
14. Select `ScheduledGamePlanningDetails`.
15. Confirm `venueName` and `venueAddress` with exact proof actions.
16. Confirm source and field focus remain active.
17. Select `CompletedGameSummary`.
18. Confirm `games[*].id` and alias `id -> gameId`.
19. Confirm source and field focus remain active.
20. Select one exact green edge. Confirm source and field focus remain active.
21. Open one field-read and one consumer proof location.
22. Return to the graph. Confirm source and field focus remain active.
23. Refresh. Confirm `sourceMethod` restores the source and the new-generation
    field focus without another origin-node selection.
24. Repeat one occurrence selection and one proof action. Confirm focus remains.
25. Clear field focus. Confirm broad graph content returns.
26. Open `/login` and select `import.meta.env`, then `DEV` when the field control
    is available.
27. Confirm one explicit stop with a location and no downstream green label.
28. Open `/games/[gameId]/schedule`. Confirm Route Totality parses and renders.
29. Record browser console errors.

Difficulty finding a control or understanding a label is product evidence.

## Positive acceptance matrix

| Required record | Minimum | Named gate |
| --- | ---: | --- |
| Exact selected origin | 1 | `readFile(storePath(), "utf8")` |
| Root property | 1 | `games` |
| Collection element | 1 | `games[*]` |
| `.find` transformation | 1 | exact receiver and result |
| Callback parameter binding | 1 | exact `item` symbol |
| Function return | 1 | exact `game` accessor result |
| `Show` render-prop binding | 1 | exact `current` symbol and accessor |
| Unique source field paths | 6 | all listed paths |
| Atomic field-to-use relationships | 18 | G01 through G18 |
| Target component occurrences | 3 | `PageHeader`, `ScheduledGamePlanningDetails`, `CompletedGameSummary` |
| Consumer kinds | 3 | render, condition, handler |
| Whole-object component binding | 1 | `game={current()}` |
| Direct scalar alias | 1 | `id -> gameId` |
| Inspector proof actions | 1 per named relationship | exact field and consumer locations |
| Green overlay | 1 complete selected-source view | current Route Totality graph |

Counts support the named gate. Counts cannot replace it.

## Completion report

The orchestrator cannot mark this plan complete without this report:

```text
Original action:
Positive fixture:
Normal control path used:
Before broad graph counts and semantic sample:
After broad graph counts and semantic sample:
Visible exact field paths:
Named field-to-use relationships:
Occurrence owners:
Consumer labels and kinds:
Proof locations opened:
Whole-object prop result:
Scalar alias result:
Named paths with frontiers:
Small negative results:
Forbidden matches absent:
Camera and readability:
Refresh result:
Console result:
Warm and cold timing:
Payload size:
Lint result:
Typecheck result:
Deferred test decision:
Screenshots or browser evidence:
```

Any named path with a frontier fails closure.

## Static checks and test boundary

During implementation, run only:

```bash
pnpm lint
pnpm typecheck
```

Do not run tests, `pnpm verify`, or a build command.

Do not create, change, or delete tests without later approval.

After the browser gate passes, ask whether focused tests should be added. If
approved, add analyzer, API, and frontend coverage. Then use `pnpm verify` as
the final repository gate.

## Retrospective closure review

This plan was reviewed against the product closure retrospective.

### Vacuous-success review

| Question | Plan answer |
| --- | --- |
| Can all checks pass with zero useful output? | No. Eighteen atomic obligations, G01 through G18, are mandatory. |
| Can the feature work only through a handcrafted URL? | No. The browser script uses normal controls. |
| Can workers finish without the main user action? | No. Every outcome task includes that action. |
| Can a negative-only result look successful? | No. Positive proof is the primary gate. |
| Is discoverability deferred? | No. Normal route and source selection are required. |
| Does verification check presentation and records? | Yes. It checks browser output and compact DTO records. |
| Does the plan preserve prior behavior? | Yes. Broad graph semantics have a separate regression gate. |

### Activation dependency review

Task 1 owns the minimum analyzer, API, state, graph, and inspector work needed
for one visible result. No activation task is deferred to the end.

### Architecture invention review

The plan fixes these decisions before implementation:

- `[*]` is a real path segment.
- `.find` is a transformation, not a field.
- direct scalar JSX aliases preserve compiler-proven identity.
- alias names do not change the source path.
- carrier frontiers can exist before a field.
- conditions and handlers are occurrence-owned consumers.
- broad graph and exact ledger have separate authority.
- full compiler identities stay out of the API.
- the normal source picker activates the query.
- named positive proof controls completion.

No worker can replace these rules with label matching or broad reachability.

### Weakest remaining risk

The most likely bad outcome is a solver that proves the six field labels but
maps conditions or handlers too broadly. Task 3 therefore requires named
consumer locations and exact occurrence ownership. Task 8 checks them in the
browser. Task 9 checks one unrelated `id` and one off-route component.

The second risk is product proof hidden behind a large ledger payload. Task 1
requires a visible end-to-end result before the ledger is generalized.

### Approval gate

This document is ready for execution review. It does not authorize code work.
