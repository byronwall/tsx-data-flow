# Expected evidence ledger

This is a handwritten ledger for the fixture. It records source facts and
expected proof points. It is not generated analyzer output.

## Scope entry

| Fact | Location | Expected evidence |
| --- | --- | --- |
| Route entry | [`src/routes/records.tsx:15`](src/routes/records.tsx#L15) | The default `RecordsRoute` export is discovered as `/records` from the `routes` directory convention. |
| Route shell use | [`src/routes/records.tsx:28-35`](src/routes/records.tsx#L28) | One `RouteFrame` occurrence owns the route's child content. |

## Exact origins and boundaries

| Origin or boundary | Location | Expected evidence |
| --- | --- | --- |
| Records resource occurrence | [`src/routes/records.tsx:16`](src/routes/records.tsx#L16) | `createResource(loadRecords)` is the route-local occurrence. The loader definition stays separate. |
| Records fetch origin | [`src/data/records.ts:3-6`](src/data/records.ts#L3) | `loadRecords` calls `fetch("/records.json")`, checks the response, and passes `response.json()` to validation. |
| Records fetch proof boundary | [`src/data/records.ts:4-6`](src/data/records.ts#L4) | Static proof reaches the fetch call and local `response.json()` to `validateRecords` expression. It stops before the external response body. |
| Records validation boundary | [`src/data/records.ts:9-28`](src/data/records.ts#L9) | `validateRecords` rejects a non-array payload and invalid record fields. |
| Viewer resource occurrence | [`src/routes/records.tsx:17`](src/routes/records.tsx#L17) | `createResource(loadViewer)` is a second, isolated route-local source. |
| Viewer fetch origin | [`src/data/viewer.ts:3-6`](src/data/viewer.ts#L3) | `loadViewer` calls `fetch("/viewer.json")`, checks the response, and passes `response.json()` to validation. |
| Viewer fetch proof boundary | [`src/data/viewer.ts:4-6`](src/data/viewer.ts#L4) | Static proof reaches the fetch call and local `response.json()` to `validateViewer` expression. It stops before the external response body. |
| Viewer validation boundary | [`src/data/viewer.ts:9-20`](src/data/viewer.ts#L9) | `validateViewer` rejects non-object payloads and missing `name` or `team` fields. |
| Selection boundary | [`src/routes/records.tsx:18-21`](src/routes/records.tsx#L18) and [`src/data/selectors.ts:7-26`](src/data/selectors.ts#L7) | The records resource is selected to active records, then packed into a summary. |
| Layout boundary | [`src/components/RouteFrame.tsx:8-17`](src/components/RouteFrame.tsx#L8) | `RouteFrame` contributes layout DOM and passes `children`; it does not read either data source. |
| Async branch boundary | [`src/routes/records.tsx:31-34`](src/routes/records.tsx#L31) | `Show` separates the loading fallback from the ready content. |
| Collection boundary | [`src/components/RecordTable.tsx:14-16`](src/components/RecordTable.tsx#L14) | `For` maps the selected records to one static `RecordRow` call site. |

## Comparable story field roles

| Canonical role | Field | Evidence and use |
| --- | --- | --- |
| identity | `id` | [`src/data/types.ts:4`](src/data/types.ts#L4); retained by `toRecordRowModel` and rendered as `data-record-id`. |
| label | `title` | [`src/data/types.ts:5`](src/data/types.ts#L5); retained by `toRecordRowModel` and rendered in the row label. |
| owner | `owner` | [`src/data/types.ts:6`](src/data/types.ts#L6); validated in the source record, but not selected into the row model or rendered. |
| status | `status` | [`src/data/types.ts:7`](src/data/types.ts#L7); selects active records and becomes the row status label. |
| measure | `score` | [`src/data/types.ts:8`](src/data/types.ts#L8); becomes the row score label and drives the flagged summary count. |
| Absent canonical roles | None | All five canonical roles are present. `owner` is the intentional non-rendered field. |

## Terminals

| Terminal | Location | Input |
| --- | --- | --- |
| Viewer DOM terminal | [`src/components/ViewerCard.tsx:5-8`](src/components/ViewerCard.tsx#L5) | Viewer `name` and `team` only. |
| Summary metric terminals | [`src/components/MetricCard.tsx:3-6`](src/components/MetricCard.tsx#L3) | Each caller supplies one summary label and value. |
| Summary occurrences | [`src/components/RecordSummary.tsx:7-8`](src/components/RecordSummary.tsx#L7) | Two caller-owned `MetricCard` occurrences use different summary fields. |
| Record row terminals | [`src/components/RecordTable.tsx:27-30`](src/components/RecordTable.tsx#L27) | Selected record `title`, status label, and score label. |
| Empty-state terminal | [`src/components/RecordTable.tsx:9-12`](src/components/RecordTable.tsx#L9) | The `Show` fallback renders when no active records are available. |
| Loading render terminal | [`src/routes/records.tsx:31`](src/routes/records.tsx#L31) | The `Show` fallback renders `Loading records...` while the records resource is pending. |
| Side-effect terminal | [`src/routes/records.tsx:23-26`](src/routes/records.tsx#L23) | A ready record selection reaches `console.info` inside `createEffect`. |

## Proven relations expected from the source

1. Static proof reaches the `loadRecords` occurrence, the exact
   `fetch("/records.json")` call, and the local `response.json()` to
   `validateRecords` expression. It stops before the external response body,
   so the ledger does not claim that a particular payload reaches validation.
2. The records resource reaches `selectVisibleRecords`.
3. The selected records reach `packRecordSummary` and `RecordTable`.
4. `RecordTable` maps each selected record through `toRecordRowModel` before
   the row DOM terminals.
5. The selected records also reach the one `console.info` side effect.
6. Static proof reaches the `loadViewer` occurrence, the exact
   `fetch("/viewer.json")` call, and the local `response.json()` to
   `validateViewer` expression. It stops before the external response body,
   so the ledger does not claim that a particular payload reaches validation.
7. `ViewerCard` does not receive records. `RecordTable` and `RecordSummary`
   do not receive the viewer. This is the source-isolation claim.
8. `RouteFrame` is a transparent layout wrapper for both child branches.
9. `MetricCard` has one definition and two caller occurrences. Their labels
   and values remain separate.

## Static occurrences and runtime multiplicity

| Element | Static occurrence | Runtime multiplicity |
| --- | --- | --- |
| `RecordsRoute` | One default route component | At most one mounted route instance. |
| `RouteFrame` | One JSX occurrence | At most one mounted shell instance. |
| `ViewerCard` | One JSX occurrence | At most one ready viewer card. |
| `RecordSummary` | One JSX occurrence | Zero while loading; one after the records branch is ready. |
| `MetricCard` | Two JSX call sites using one definition | Zero while loading; two after the summary branch is ready. |
| `RecordRow` | One JSX call site inside `For` | Zero or one instance per selected record. The count is not statically known. |
| `Show` and `For` | One occurrence of each control | Branch selection and row count depend on runtime data. |

## Intentional gaps

- The JSON response bodies are external to this source tree. Static proof stops
  at each fetch response and its local `response.json()` to validator call. It
  does not prove payload contents, file provenance, or network behavior.
- `createResource` crosses an async boundary. The current analyzer records that
  boundary and does not prove every payload step inside the fetch.
- Static `<For>` occurrence identity does not equal runtime row count.
- The `Show` branch is statically present. This ledger does not claim which
  branch runs for a particular response.
- `console.info` is a host side effect. The fixture does not trace a later
  external write or reconciliation result.
- Route discovery uses the repository's `routes/<name>.tsx` convention. No
  framework router configuration is included.
