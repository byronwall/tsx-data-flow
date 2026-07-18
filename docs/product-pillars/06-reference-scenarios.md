# Reference Scenarios and Acceptance Tests

These scenarios are product contracts. Unit fixtures prove syntax precision; these repositories prove usefulness.

The first vertical slice uses Scenario B as its primary fixture. Scenario C is the required robustness check. Scenario A remains a later Application Atlas fixture.

## Scenario A: Understand `wall-portfolio`

### Questions the product must answer

1. What kind of application is this?
2. What are its human-facing and machine-facing entry points?
3. Which routes are static, dynamic, or special HTTP responses?
4. Which routes load filesystem MDX content?
5. How does an MDX tag become a React component?
6. Which registered components are plain presentation and which introduce interactive client behavior?
7. How do the blog and projects pipelines share infrastructure?
8. Which application regions are strongly connected despite living in different folders?

### Ground truth evidence

- `package.json` includes Next and `next-mdx-remote`.
- `app/layout.tsx` is the application layout.
- `app/blog/[slug]/page.tsx` and `app/projects/[slug]/page.tsx` are dynamic routes and define static params.
- `app/og/route.tsx` is an HTTP image route.
- `app/blog/utils.ts:69-94` discovers/reads MDX and builds blog post records.
- `app/blog/utils.ts:131-134` uses the same pipeline for project content.
- `app/components/mdx.tsx:57-156` maps MDX names/elements to components.
- `app/components/mdx.tsx:159-172` passes that registry to `MDXRemote`.
- interactive MDX components live under `app/blog/components/`.

### Required atlas result

The initial map should show, at minimum:

```text
Next application
├─ shared layout/navigation
├─ home
├─ blog index
├─ blog detail [slug]
│  └─ filesystem MDX -> metadata/content -> MDX registry -> article/components
├─ projects index
├─ project detail [slug]
│  └─ filesystem MDX -> metadata/content -> MDX registry -> article/components
├─ experience index/detail [slug]
├─ about
└─ OG image HTTP route
```

The exact filesystem route count should be computed from current source, not hard-coded from the transcript.

### Required trajectory

Select `app/blog/[slug]/page.tsx` and show:

```text
slug parameter
  -> post lookup
  -> MDX content + metadata
  -> reading time / table of contents / metadata
  -> CustomMDX
  -> registry-backed possible component renders
  -> article DOM terminals
```

The registry edge to an arbitrary MDX component may be “possible runtime” rather than guaranteed. The UI must label it that way.

### Failure conditions

- calling every `page.tsx` merely a render file without route semantics;
- presenting all registry components as definitely rendered by every post;
- omitting the filesystem content boundary;
- treating `app/og/route.tsx` as an ordinary page;
- claiming full coverage while MDX runtime selection is opaque.

## Scenario B: Explain a `visual-notes` time block

### Questions the product must answer

1. What is the canonical persisted and UI-facing time-block shape?
2. How are Prisma rows mapped into `TimeBlockItem`?
3. Where are optimistic times overlaid?
4. Why is a block placed at its current `left`, `top`, `width`, and `height`?
5. How do day grouping and overlap grouping affect geometry?
6. Which state selects rest, move, resize, creation preview, and drag ghost variants?
7. How does a pointer interaction become a persisted update?
8. How does authoritative server state reconcile with optimistic state?
9. Does grouping by day simplify rendering but complicate cross-day movement, and what evidence supports that conclusion?

### Ground truth evidence

- `src/services/time-blocks/time-blocks.types.ts` defines `TimeBlockItem`.
- `src/services/time-blocks/time-blocks.queries.ts:48-83` maps Prisma results.
- `src/services/time-blocks/time-blocks.queries.ts:126-150` performs the weekly Prisma read.
- `src/components/time-blocks/WeeklyTimeBlocksCalendar.tsx:152-188` loads and optimistically merges blocks.
- `src/components/time-blocks/overlap.ts:3-6` declares the augmented position type.
- `src/components/time-blocks/overlap.ts:16-45` computes overlap groups and slots.
- `WeeklyTimeBlocksCalendar.tsx:340-357` groups by day and flattens overlap groups.
- `WeeklyTimeBlocksCalendar.tsx:742-795` computes preview and drag-ghost geometry.
- `WeeklyTimeBlocksCalendar.tsx:1329-1394` computes/render resting block geometry and interaction handlers.
- `WeeklyTimeBlocksCalendar.tsx:1495-1516` renders the drag ghost.
- `src/services/time-blocks/time-blocks.actions.ts:102-140` performs updates.

### Required canonical lineage result

```text
Prisma timeBlock row
  -> mapTimeBlock
  -> TimeBlockItem
  -> resource collection
  -> optimistic field overlay (startTime/endTime only)
  -> TimeBlockWithPosition augmentation (index/totalOverlaps)
```

For every arrow, show field provenance and identity effect. Do not label `TimeBlockWithPosition` a disconnected mirror if compiler and spread evidence prove augmentation.

### Required rest-geometry result

For the rendered `Box` style at approximately lines 1379–1390, show contributors grouped as:

- canonical data: `startTime`, `endTime`, `color`, `id`;
- calendar viewport: `weekStart`, `numberOfDays`, `startHour`, `endHour`, `hourHeight`, `snapMinutes`;
- collection layout: `dayIndex`, `index`, `totalOverlaps`, lane gutter;
- interaction state: `draggingBlockId` affects opacity;
- operations: visible clipping, date-to-grid conversion, overlap slot formula, minimum height, color normalization;
- terminal fields: background, opacity, left, width, top, height.

### Required variant result

At minimum:

| Variant | Selector | Terminal |
|---|---|---|
| Resting block | block in grouped collection | `data-testid="time-block-item"` |
| Dragged original | same block ID equals dragging ID | resting block with reduced opacity |
| Move/resize ghost | drag state is move or resize | `data-testid="time-block-drag-ghost"` |
| Creation preview | drag state is create | creation preview box |
| Resize controls | resting block rendering | top/bottom pointer handles |

The model must state which variants coexist and which are exclusive.

### Required mutation lifecycle result

```text
pointer event
  -> DragState transition
  -> computed current start/end
  -> optimisticTimes[id]
  -> updateTimeBlock action payload
  -> Prisma update
  -> resource refresh/server data
  -> optimistic entry retained or removed by reconciliation comparison
  -> block geometry re-render
```

If any step cannot be crossed statically, the lifecycle remains partial with a named opacity point.

### Architecture question: premature grouping

The transcript hypothesizes that grouping blocks by column/day may complicate moving across columns. The code currently groups by day in `groupedBlocksByDay`, then renders a nested `<For>` by day and block. This is an observable fact. Whether it is a defect requires additional evidence:

- movement code must translate across day groups;
- state or keyed ownership must cause extra reconciliation/animation work;
- a flat surface would preserve required z-order and interaction semantics;
- tests or runtime behavior demonstrate the burden.

The tool should surface the grouping boundary and cross-day transition path, then phrase “premature grouping” as suspicious until those consequences are proven.

### Failure conditions

- stopping at literals such as `100`, `7`, or `[]` as if they were domain sources;
- showing the style object without the upstream `TimeBlockItem` lineage;
- omitting write/reconciliation paths;
- calling overlap and geometry transformations needless merely because they are long;
- flattening rest and drag variants into one unlabeled trace;
- recommending removal of day grouping without evidence of interaction burden.

## Scenario C: Explain a Pluck saved capture

This is the first slice's robustness fixture, not a second source of product requirements. The same analyzer records, DTO, layout, interactions, and inspector used for time blocks must work here without Pluck-specific UI code.

### Ground truth evidence

- `app/src/routes/captures/[captureId].tsx:38-74` uses the route parameter to load page detail, summary detail, and full detail resources and chooses the most complete available value.
- `app/src/lib/pluck/store/capture-detail.ts:46-89` reads persisted manifests, sections, nodes, DOM, CSS, and fragments; normalizes/merges them; and constructs `CaptureDetail`.
- `app/src/lib/pluck/store/json.ts:20` performs the filesystem read, JSON parse, and Zod validation.
- `app/src/routes/captures/[captureId].tsx:164-203` passes the selected detail through `CaptureViewerRouteShell`.
- `app/src/components/pluck/viewer/CaptureViewerRouteShell.tsx:13-22` passes `CaptureDetail` into `CaptureDetailWorkspace`.
- `app/src/components/pluck/viewer/CaptureDetailWorkspace.tsx:65-85` creates the viewer model and exposes it through context before rendering the workspace.
- Stage target, geometry, layer, and inspector modules under `app/src/components/pluck/viewer/` consume parts of that detail.

### Required trajectory result

Starting from `/captures/[captureId]`, the route context should expose the persisted capture types that intersect the route. Selecting `CaptureDetail` or a participating field should produce a coherent path equivalent to:

```text
captureId route parameter
  -> persisted capture JSON files
  -> JSON parse + Zod validation
  -> manifest/section/node/fragment reads
  -> merge + normalization
  -> CaptureDetail assembly
  -> Solid resources and available-detail selection
  -> CaptureViewerRouteShell
  -> CaptureDetailWorkspace / viewer context
  -> one representative stage or inspector render terminal
```

The visualization may collapse repeated file reads into one expandable operation. Expansion must reveal the individual reads and shapes.

### Robustness assertions

- The trajectory remains readable with a much larger object shape than `TimeBlockItem`.
- Context/provider traversal does not make the value appear to change identity without evidence.
- Summary/full-detail fallback is shown as a conditional value selection, not three unrelated data flows.
- Unknown DOM/JSON fields remain explicit opacity rather than guessed structure.
- The UI does not assume Prisma or database terminology.
- A user can move from the Pluck route to a rendered stage/inspector sink and open evidence in source without losing diagram state.

## Shared acceptance rubric

Score each scenario from 0–2 on each dimension:

| Dimension | 0 | 1 | 2 |
|---|---|---|---|
| Entry-point accuracy | absent/wrong | partial | complete for supported adapter |
| Canonical identity | names only | type identity | type + field provenance |
| Trajectory coherence | disconnected facts | partial path | ordered evidence path |
| Control/variants | absent | conditions listed | selectable joined variants |
| Read/write lifecycle | render only | partial mutation | reconciliation loop |
| Coverage honesty | implied complete | generic warning | per-capability/per-path opacity |
| Scale/navigation | unreadable/truncated | focus only | hierarchy + expand/isolate |
| Advice quality | generic | suspicious with evidence | invariant + disproof + blast radius |

A pillar is product-ready for a scenario only when no dimension scores 0 and the relevant pillar dimensions score 2.
