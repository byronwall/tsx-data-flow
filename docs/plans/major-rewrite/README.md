# Major rewrite outstanding work

Keep only work that is not complete in this file. Remove an item after its
implementation commit lands.

## Next decision

Choose one option. Do not start both.

### Add one collection operation

This option extends proof beyond the current `.find` pattern. It follows one
`availability` item through `.filter` and proves one exact `status` consumer.

```ts
const available = snapshot.availability.filter(
  (item) => item.gameId === game.id,
);
const count = available.filter(
  (item) => item.status === "available",
).length;
```

Keep `map`, aggregation, destructuring, spread, and rename outside this slice.

### Plan route cutover

The product still has Current workspace and Route Totality renderers. This
option identifies any question that only the older renderer can answer.

```tsx
return renderer() === "totality"
  ? <RouteTotalityGraph {...props} />
  : <CurrentWorkspace {...props} />;
```

Removal starts only after Route Totality has question parity. It must preserve
source selection, field focus, findings, code navigation, state, and gaps.

#### Confirmed remaining Current workspace gaps

##### Semantic operation and shape explanation

Current workspace shows ordered operation cards. Each card can show input and
output shapes, field effects, completeness, and exact source expressions.

Route Totality explains occurrences, evidence, fields, findings, and gaps. It
does not provide an equivalent semantic-stage or before-and-after shape view.

```ts
type OperationChange = {
  inputShapeId: string;
  outputShapeId: string;
  fieldEffects: string[];
};
```

Decide whether Route Totality must own this view. A clear handoff to Current
workspace could preserve it during an incremental cutover.

This is the highest-impact remaining Current-only product question.

##### Source-focused stage inventory

Current workspace summarizes resources, owners, transforms, paths, and reached
terminals for the selected source. It also distinguishes exact, handoff,
resource-only, and unavailable source matches.

Route Totality exposes stronger exact field proof. It lacks the same compact
source-stage inventory and gives little feedback when no exact origin matches.

```ts
type SourceStageSummary = {
  resources: string[];
  transforms: string[];
  terminalIds: string[];
  match: "exact" | "handoff" | "resource" | "unavailable";
};
```

The smallest repair is an explicit unmatched-source message. Add an inventory
only if users still need the broader stage summary.

##### Work packets

Current workspace can collect selected operations into a local packet. Users
can annotate, reorder, remove, persist, and copy packet entries as Markdown.

Route Totality has no packet controls. Decide whether packets remain a product
requirement before treating their absence as a cutover blocker.

```ts
type PacketEntry = {
  route: string;
  operationId: string;
  note: string;
};
```

##### Renderer-aware controls

The shared `All paths` and `Evidence cards` controls remain visible in Route
Totality, but Route Totality does not use that state.

Hide or replace controls that do not affect the active renderer. Do not keep a
control that appears to work but has no visible effect.

##### Renderer comparison state

Switching renderers clears Route Totality selection, camera, isolation, and
field focus. This is safe, but it makes direct renderer comparison harder.

Preserve separate renderer state only if side-by-side comparison remains an
important cutover workflow. Do not add state complexity for ordinary use.

##### Generic UI detail

Current workspace can reveal or hide individual generic UI components. Route
Totality provides one global generic UI visibility control.

Per-component control is a lower-impact difference. It should block cutover
only if real investigations require selective wrapper visibility.

#### Differences that do not block cutover

- Exact field-use isolation now provides one field-backed
  source-to-consumer-to-terminal path.
- Normal and isolated views use the same canonical terminal routing.
- Current topology and Route Totality do not need identical graph structures.
- Manual node placement, layout ticks, copied topology JSON, and force arrows
  are debug tools.
- Route Totality already has stronger proof, gap, finding, and context views.
- Both renderers support isolation, navigation, camera interaction,
  restoration, and partial states.

#### Smallest cutover-oriented slice

Make the shared view controls renderer-aware. Hide or replace `All paths` and
`Evidence cards` when Route Totality is active.

This removes one confirmed misleading interaction without deciding the larger
semantic operation and shape question.

## Deferred candidates

These items require a separate product decision.

### More collection fields

This work would prove item fields in `players`, `schedules`, and `liveGames`.
Each collection can use different selection, lookup, and rendering patterns.

```ts
const activeIds = snapshot.players
  .filter((player) => player.active)
  .map((player) => player.id);
```

Do not group all collection syntax into one analyzer change.

### Object and derived-value transforms

This work would preserve field identity through object reshaping. It includes
destructuring, spread, rename, construction, and derived scalar values.

```ts
const { displayName: name, ...playerData } = player;
const summary = { ...playerData, name, label: name.toUpperCase() };
```

Each supported transform needs an exact positive and fail-closed example.

### Broader type-and-transform view

This view would explain how a value's shape changes along a selected path. It
would show field mappings without placing full compiler types on the graph.

```ts
type Source = { id: string; displayName: string };
type ViewModel = { id: string; label: string };
// displayName -> label
```

This is a product view, not only additional proof grammar.

### Finding cause and reanalysis

This work would group exact findings that share one proven cause. It would show
affected consumers and compare the same semantic question after code changes.

```ts
const impact = {
  causeId: "field-read:status",
  consumerIds: ["condition:canBuild", "render:badge"],
};
```

It must not group findings by similar labels or counts alone.

### Read, interaction, write, and reconciliation

This work would follow data from rendering into an event and external write.
It would then show how refreshed state returns to the visible route.

```ts
const save = async () => {
  await updateGame({ id: game.id, status: "completed" });
  await refresh();
};
```

The read path, event path, write path, and refresh path remain distinct.

### Repository application atlas

This work would index routes, commands, endpoints, and handlers in one entry
surface. Each entry would open the existing evidence slice instead of creating
another graph truth.

```ts
const scopes = [
  { kind: "route", name: "/games/[gameId]" },
  { kind: "endpoint", name: "POST /api/soccer" },
];
```

The atlas should summarize evidence, coverage, and boundaries.

### Agent investigation packets

This work would export one selected investigation for a coding agent. The
packet would contain exact locations, paths, gaps, and the desired invariant.

```json
{
  "scope": "/games/[gameId]",
  "field": "games[*].status",
  "consumers": ["canBuildSchedule"],
  "gaps": []
}
```

It should exclude unrelated source and large analyzer payloads.

### Pluck-scale performance proof

This work would run the current product journey on a representative large
repository. It would record cold time, memory, payload size, and interaction
time without changing semantics.

```json
{
  "coldMs": 0,
  "peakMemoryMb": 0,
  "payloadBytes": 0,
  "selectionMs": 0
}
```

The measurements should identify one real bottleneck before optimization.

### Focused module cleanup

This work is not a separate refactor program. Extract a responsibility only
when a current feature forces unrelated behavior into one module.

```ts
const candidates = discoverCandidates(input);
const result = verifyCandidateTransfers(candidates, evidence);
```

Keep behavior changes separate from structural cleanup when practical.

Do not convert this list into one implementation program.

## Verification

Use the maintained field-proof runner for selected-source work:

```bash
pnpm accept:route-field-proof \
  --root <analyzed-project-root> \
  --route <route-path-or-key> \
  --source <source-key-or-file:line[:column]> \
  --obligations scripts/route-field-proof-obligations.json
```

Follow `AGENTS.md` for the current lint, typecheck, browser, test, and build
rules.

The field-use isolation mouse gate passed on the stable canonical route. The
final OS-level Enter and Space check remains pending approval.
