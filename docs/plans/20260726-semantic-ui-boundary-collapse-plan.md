# Convention-Based UI Hiding and Ring Disclosure Plan

## Purpose

Simplify the route Component Topology view by hiding components that the
repository explicitly treats as generic UI infrastructure.

The first convention is:

```text
**/components/ui/**
```

Components defined under that path are hidden by default in this view:

```text
?viz=trajectory
&trajectoryMode=detail
&view=context
```

The last visible parent receives one shared `components/ui` ring. A dedicated
hidden-components pane lists everything suppressed by the policy and lets the
user reveal one component at a time. The full analyzed graph remains available;
this is a reversible display projection, not analyzer pruning.

Do not apply this convention to Markdown reports, detailed source inspection,
or other product views in the first slice.

## Product decisions

1. **`components/ui` is authoritative.** Components in the directory are
   intentionally generic even when their implementations contain substantial
   logic, state, hooks, parsing, or nested UI structure. Their internals belong
   in a separate inspection tool or a deliberate disclosure.
2. **UI hiding is on by default** in the Component Topology context view.
3. **Unknown conventions remain visible.** SolidJS framework components,
   `HStack`, `VStack`, and similar candidates are not hidden until reviewed and
   added explicitly.
4. **Trust wins outside explicit rules.** When the tool does not have an exact
   configured match, it favors a noisier graph over speculative hiding.
5. **Hidden components leave a ring, not a replacement node.** The same
   `components/ui` ring appears on every last visible parent that reaches one or
   more hidden UI components.
6. **Every hidden item is disclosed in a pane.** The pane shows what was hidden,
   why, where it is defined, which visible parent owns the ring, and whether it
   is currently revealed.
7. **Disclosure is opt-in and incremental.** Reveal one hidden component at a
   time. Revealing one item does not reveal its hidden UI children or unrelated
   groups.
8. **Existing rings continue.** Shared contexts, icon packages, and reused
   non-UI hubs retain the existing ring treatment. UI-policy rings use the same
   visual language but have distinct meaning and copy.
9. **Configuration lives at `.tsx-dataflow/config.json`.** Only one config at
   the analyzed project root is supported initially; no nested or cascading
   configs.
10. **Invalid configuration fails analysis.** Schema, type, or glob errors throw
    with the config path and exact invalid field. The tool must not silently
    fall back to a different graph.
11. **Global mode survives refresh; individual reveals do not need to.** The
    URL preserves whether UI hiding is enabled. Per-component disclosures are
    local exploratory state in the first slice.

## Clarification: logic inside `components/ui`

The earlier review proposed safety vetoes for components that contain
“interesting” operations. Examples included:

- a date picker that reads a context or uses several stateful hooks;
- a markdown renderer that parses and transforms source text;
- an image viewer that derives viewport geometry;
- a UI wrapper containing fallbacks, effects, or formatting logic.

Those examples do **not** veto hiding under the decided product model. The path
is an explicit statement that these components are generic relative to the
route-data investigation. A user who cares about their internals reveals them
from the pane or uses a separate component-focused tool.

The “favor noise” decision applies to possible future conventions. For example,
the tool must not automatically hide all SolidJS control-flow components or
every component named `HStack` until those rules have been reviewed.

## Current rings and the new responsibility

The existing `summarizeSharedComponentHubs` projection performs frequency
compression:

- icon packages become ring categories;
- components with more than five callers become shared hubs;
- contexts with more than five consumers become shared hubs;
- qualifying edges are hidden and colored rings are attached to callers.

The new policy performs convention-based hiding. These systems should share a
rendering model but remain semantically distinct:

| Ring category | Why information is hidden | Ring attachment |
| --- | --- | --- |
| `components/ui` | Explicit repository convention says the component is generic | Last visible non-hidden parent |
| Icon package | Package classification says individual icon edges are repetitive | Existing visible caller |
| Shared component | High repeated caller count makes individual edges noisy | Existing visible caller |
| Shared context | High consumer count makes individual edges noisy | Existing context treatment |

The `components/ui` ring is one category shared across all matching components.
It does not allocate a color or ring identity per hidden component. Its tooltip
and pane entry report the actual members.

## Primary user flow

1. Open Data Trajectories in detailed context mode.
2. `Hide generic UI` is active by default.
3. Components outside configured hidden paths render normally.
4. A visible component that renders one or more `components/ui` components gets
   the shared UI ring.
5. The summary/header reports the number of hidden UI components and hidden
   references.
6. Open the `Hidden` pane.
7. Review hidden items grouped by their last visible parent.
8. Select one item to inspect its filename and relationship.
9. Choose `Show` to disclose that component and its direct edges.
10. Its nested `components/ui` children remain hidden and produce the same ring
    on the newly visible component.
11. Choose `Hide again` to restore the default projection.
12. Use `Show all` to disable the policy for the entire view.

The user opts into disclosure. Opening a ring or pane must not unexpectedly
expand the entire generic subtree.

## Configuration

### Location

Use:

```text
<analyzed-project-root>/.tsx-dataflow/config.json
```

This coexists with the existing `.tsx-dataflow/` report-output convention.

### Initial schema

```json
{
  "version": 1,
  "topology": {
    "hideGenericUiByDefault": true,
    "hiddenComponents": {
      "include": [
        "**/components/ui/**"
      ],
      "exclude": []
    }
  }
}
```

### Built-ins and project rules

The tool has one built-in include:

```text
**/components/ui/**
```

Project `include` entries extend that built-in. For example:

```json
{
  "version": 1,
  "topology": {
    "hiddenComponents": {
      "include": ["**/design-system/**"],
      "exclude": ["**/design-system/domain-chart.tsx"]
    }
  }
}
```

This hides both `components/ui` and `design-system`, while keeping the named
domain chart visible. A project does not need to repeat the built-in rule.

`exclude` wins over built-in and configured includes. This provides the simple
escape hatch for a repository that has one component under `components/ui`
that should participate in route-level inspection.

Rules are project-root-relative POSIX globs after path normalization. Version 1
does not support component-name rules, package rules, source annotations, or
nested project configs.

### Failure behavior

The config loader throws for:

- invalid JSON;
- unsupported `version`;
- unknown keys;
- wrong value types;
- empty or invalid glob patterns.

The error names `.tsx-dataflow/config.json` and the invalid field. The server
shows the analysis failure through its existing error/loading surface. It does
not retain a stale successful graph or fall back to built-ins.

## Projection behavior

### Keep the complete graph

The analyzer and route-data DTO continue to describe the complete topology.
The UI derives a visibility projection using:

- normalized component definition paths;
- the effective hidden-component rules;
- the global hide/show mode;
- the set of individually revealed component identities.

This makes mode changes and individual disclosure immediate and prevents the
configuration from reducing analysis coverage.

### Hidden records

```ts
type HiddenComponentPolicy = {
  enabledByDefault: boolean;
  include: string[];
  exclude: string[];
  configPath: string | null;
};

type HiddenComponentRecord = {
  componentId: string;
  label: string;
  file: string;
  line: number | null;
  matchedRule: string;
  visibleParentIds: string[];
  directHiddenParentIds: string[];
  hiddenChildIds: string[];
  incomingReferenceCount: number;
  terminalCount: number;
};

type HiddenComponentProjection = {
  topology: ComponentTopology;
  hidden: HiddenComponentRecord[];
  uiRingsByNode: Map<string, UiPolicyRing>;
  hiddenNodeIds: Set<string>;
  hiddenEdgeIds: Set<string>;
  originalToVisibleAncestorIds: Map<string, string[]>;
};
```

Component identity must use the existing source-backed component occurrence or
resolved component identity—not display names—so two different `Button`
components do not share disclosure state.

### Last visible parent

For each edge entering a hidden component:

1. Walk upstream through hidden components.
2. Find the nearest visible component or route boundary.
3. Hide the matching component nodes and their internal edges.
4. Attach one `components/ui` ring to each nearest visible parent.
5. Accumulate unique hidden components and reference counts on that ring.

If a hidden UI chain reaches a non-hidden descendant, keep the descendant
visible. Reconnect it to the nearest visible ancestor with a summarized edge
whose `via` metadata names the hidden UI hop count. Attach the UI ring as well.
This conservative rewiring prevents a generic wrapper from making a feature
component disappear.

A route entry, source, resource, or context node that does not itself represent
a matching component remains visible. The first slice hides matching component
nodes; it does not infer that neighboring non-component nodes are generic.

### Individual disclosure

Revealing a component removes only its identity from the current hidden set:

- the component node and direct incoming/outgoing edges become visible;
- matching UI ancestors remain hidden unless needed to connect the disclosed
  node, in which case they appear as summarized `via` hops rather than fully
  disclosed nodes;
- matching UI descendants remain hidden and place the UI ring on the disclosed
  component;
- source selection, field labels, isolation, and existing selection state are
  reprojected from complete evidence.

This is a pure projection update and does not trigger analysis or change the
layout meaning of unrelated nodes.

## UI behavior

### Global control

Add a visible toggle group to the Component Topology header:

- `Hide generic UI` — default;
- `Show all`.

Use `aria-pressed` and the restrained one-click treatment required by
`docs/design-preferences.md`.

Store the global mode in URL state:

```text
genericUi=hidden|all
```

The project configuration supplies the default only when the URL is silent.
Individual disclosure remains local state and resets when the dialog/view is
reopened or the analysis generation changes.

### Hidden pane

Add a dedicated pane or inspector section labeled `Hidden`. It must remain
available even when there are no hidden matches, in which case it explains the
active rule and reports zero matches.

Group entries by last visible parent. Each row contains:

```text
Component | Definition | Rule | References | State | Action
```

Actions:

- `Show` for a hidden component;
- `Hide again` for an individually disclosed component;
- `Show all` as a global action.

The pane also reports:

- active config path or “built-in defaults”;
- effective include/exclude rules;
- unique components hidden;
- references hidden;
- individually disclosed count.

The exact pane placement should reuse the existing persistent inspector region
before adding another permanent layout column. A small `Hidden · N` selector or
tab can switch the inspector between selection details and the hidden inventory.

### Rings

Use one stable UI-policy ring identity and color. The ring tooltip states:

```text
Generic UI hidden by components/ui convention
N components · M references
Open Hidden pane to review or reveal
```

If a visible parent has other existing rings, render the UI ring alongside them
using the current concentric-ring behavior. The legend separates:

- `Hidden by convention`;
- `Recurring references`.

Do not call the UI ring a “shared hub”; it represents policy, not frequency.

## Relationship to existing rings

Use one ordered projection:

```text
complete topology
  -> apply configured component hiding and compute UI-policy rings
  -> summarize recurring relationships on the remaining visible graph
  -> merge ring metadata by visible node
  -> apply selection and isolation
  -> layout and render
```

Rules:

- a hidden `components/ui` component does not also become a frequency hub;
- a revealed UI component may participate in ordinary ring logic only when the
  user has explicitly disclosed it;
- shared contexts and non-UI hubs remain unchanged;
- icon rings remain unchanged;
- copied selection/debug payloads list policy-hidden and frequency-hidden
  relationships separately;
- header totals distinguish hidden components from summarized references.

## Implementation sequence

### Phase 0 — Confirm the target view and baseline

- Use the provided route/detail/context URL as the target surface.
- Record complete-topology node, edge, and existing ring counts.
- Record how many matched `components/ui` nodes and references would hide.
- Identify any visible non-UI descendants reached through matching UI wrappers.
- Capture the current graph and hidden-pane area before changing behavior.

Exit criterion: the plan can name the last visible parents that will receive UI
rings and the members each ring will represent.

### Phase 1 — Strict single-root configuration

- Add `src/project/config.ts` with a strict versioned schema.
- Load `.tsx-dataflow/config.json` relative to `AnalyzerArgs.root`.
- Merge project includes with the built-in `components/ui` rule; apply excludes
  last.
- Throw actionable errors for invalid configuration.
- Carry the effective policy through the analysis worker and route-data API.
- Include config identity in refresh/generation behavior.
- Document the schema in `README.md` and `docs/analyzer.md`.

Likely touched files:

- `src/project/config.ts`;
- `src/types.ts`;
- CLI/server composition around `src/cli/args.ts` and
  `src/server/analysis-worker.ts`;
- `src/api/contracts.ts`;
- `src/api/projections/route-data.ts`;
- `README.md`;
- `docs/analyzer.md`.

Exit criterion: absent config uses the built-in rule; a valid config extends or
excludes it; invalid config stops analysis with the exact failure.

### Phase 2 — Pure hidden-component projection

- Add a focused `component-topology-hidden-components.ts` model.
- Normalize source-backed component paths relative to the analyzed root.
- Resolve the hidden set using exact component identity and rules.
- Calculate last visible parents, hidden records, hidden edges, passthrough
  edges, and UI-policy rings.
- Preserve non-hidden descendants through conservative summarized rewiring.
- Map selected-source, field, transform, and terminal participation from full
  evidence onto visible ancestors and disclosed nodes.
- Expose a debug payload before changing the rendered graph.

Exit criterion: a pure model comparison accounts for every original node and
edge as visible, hidden, or summarized; no item simply disappears from totals.

### Phase 3 — Integrate the ring pipeline

- Apply convention hiding before `summarizeSharedComponentHubs`.
- Merge UI-policy and recurring ring metadata at visible nodes.
- Split legend, header, selection copy, and debug counts by hiding reason.
- Ensure no hidden UI component is also counted as a recurring hub.
- Recompute rings after individual reveal/hide actions.

Exit criterion: the last non-hidden parent carries one UI ring regardless of
how many nested `components/ui` components it reaches, and the pane exposes all
members.

### Phase 4 — Add default mode and hidden pane

- Add `Hide generic UI` / `Show all` controls.
- Parse and serialize `genericUi` URL state.
- Add the `Hidden · N` inspector mode with a table-shaped inventory.
- Support one-at-a-time `Show` and `Hide again` actions.
- Reconcile selection, isolation, camera, and source filtering after projection
  changes.
- Keep Solid's initial DOM structure deterministic.

Exit criterion: disclosure is reversible without re-analysis and does not
expand unrelated UI components.

### Phase 5 — Manual product validation

On the supplied route:

- confirm all matched `components/ui` components are absent by default;
- confirm each affected visible parent has the shared UI ring;
- confirm the pane lists every hidden component and reference;
- reveal components individually, including a nested chain;
- confirm non-UI descendants remain visible;
- select a data source and verify highlighted lineage reaches the correct
  visible parent/ring;
- switch to `Show all` and recover the original complete topology;
- refresh and confirm the global mode restores while individual reveals reset.

Then inspect SolidJS components, `HStack`, and `VStack` as candidates for a
future rule. Do not hide them in this slice.

## Acceptance criteria

- `**/components/ui/**` is hidden by default in the target Component Topology
  context view.
- Hidden components are removed from the canvas rather than replaced with
  boundary nodes.
- Every last visible parent receives at most one `components/ui` policy ring.
- One ring may represent several hidden components and references.
- The Hidden pane lists every policy-hidden component with definition, matched
  rule, visible parent, and disclosure action.
- A user can reveal or hide one component without affecting unrelated hidden
  components.
- Revealed components may still carry a UI ring for hidden UI descendants.
- Non-matching feature descendants never disappear solely because a matching UI
  wrapper sits above them.
- Existing context, icon, and non-UI shared-hub rings remain available.
- The UI clearly distinguishes convention hiding from frequency summarization.
- Source and field selection use full evidence and remain truthful after
  projection.
- `Show all` restores the complete pre-projection topology.
- The global mode survives refresh; individual reveals may reset.
- absent config uses built-ins; valid config extends/excludes them; invalid
  config throws.
- Markdown and other views remain unchanged.

## Verification

During product iteration:

- run `pnpm lint` and `pnpm typecheck`;
- exercise the supplied URL manually;
- inspect copied debug payloads for hidden/visible accounting;
- do not modify tests or run `pnpm verify` until Byron explicitly approves the
  test phase;
- do not run build scripts.

After test work is approved, prioritize:

1. config parsing, strict failure, include extension, and exclude precedence;
2. project-relative path normalization;
3. last-visible-parent discovery across nested hidden chains;
4. non-hidden descendant passthrough;
5. exact component identity for disclosure state;
6. no double-counting between policy and frequency rings;
7. one-at-a-time reveal/hide behavior;
8. URL global-mode restoration;
9. selected-source and isolation projections;
10. deterministic initial Solid structure and keyboard-accessible pane actions.

## Deferred decisions and follow-on candidates

- whether SolidJS primitives should be hidden by package or semantic role;
- whether `HStack`, `VStack`, and similar layout primitives should be built-in
  component-name rules;
- whether config should eventually support package and symbol identities;
- whether detailed trajectory paths should reuse the hiding policy;
- whether individual disclosure should persist in URL state;
- whether successful convention-based rings make some current frequency rings
  redundant;
- whether the hidden inventory deserves a permanently separate pane after the
  first implementation.

## Most likely failure

The likely bad implementation hides `components/ui` nodes and their edges but
does not preserve accounting, non-UI descendants, or source-lineage projection.
The graph looks cleaner, yet the user cannot tell what vanished or why and may
mistake a policy-filtered path for complete analysis.

The prevention is concrete: one shared policy ring on the last visible parent,
a complete hidden-item inventory, conservative passthrough for non-matching
descendants, and a one-click complete view.
