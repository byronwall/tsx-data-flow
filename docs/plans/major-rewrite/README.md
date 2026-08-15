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
