import type { Workspace, WorkspaceFileRow } from "../../api/contracts";
export type OverviewFilter = "all" | "findings" | "unknown" | "participating";
export type OverviewSort = "burden" | "findings" | "depth" | "file";
export interface OverviewState {
  q: string;
  filter: OverviewFilter;
  sort: OverviewSort;
  page: number;
  all: boolean;
}
export interface OverviewRow {
  key: string;
  count: number;
  worst: number;
  depth: number;
  worstSink: WorkspaceFileRow["worstFinding"];
  shape: string;
  ownership: string;
  firstCut: string;
}
export type EntryCountKey = "boundaries" | "relays" | "unknown" | "fanOut";
export type EntryCounts = Record<EntryCountKey, number>;

export function overviewState(params: URLSearchParams): OverviewState {
  const q = (params.get("q") ?? "").trim();
  const filterParam = params.get("filter");
  const sortParam = params.get("sort");
  const filter = isOverviewFilter(filterParam) ? filterParam : "all";
  const sort = isOverviewSort(sortParam) ? sortParam : "burden";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  return { q, filter, sort, page, all: params.get("all") === "1" };
}

export function overviewHref(
  state: OverviewState,
  changes: Partial<OverviewState> = {},
) {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.filter && next.filter !== "all") params.set("filter", next.filter);
  if (next.sort && next.sort !== "burden") params.set("sort", next.sort);
  if (next.all) params.set("all", "1");
  else if (next.page && next.page !== 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function overviewRows(
  report: Workspace | undefined,
  state: OverviewState,
): OverviewRow[] {
  if (!report) return [];
  const q = state.q.toLowerCase();
  const typeCounts = entryTypeCountsByFile(report);
  let rows = report.files.map((file) => ({
    key: file.path, count: file.findings.count, worst: file.findings.worstBurden,
    depth: file.findings.maxDepth, worstSink: file.worstFinding,
    shape: file.classification.primaryShape, ownership: file.classification.ownership,
    firstCut: file.classification.firstCut,
  }));
  rows = rows.filter((row) => {
    const counts = typeCounts.get(row.key) ?? emptyEntryCounts();
    if (state.filter === "findings" && row.count <= 0) return false;
    if (state.filter === "unknown" && !counts.unknown) return false;
    if (state.filter === "participating" && !report.files.find((file) => file.path === row.key)?.flags.graphParticipant)
      return false;
    if (
      q &&
      ![row.key, row.shape, row.ownership, row.firstCut]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  rows.sort((left, right) => {
    if (state.sort === "file") return left.key.localeCompare(right.key);
    if (state.sort === "findings")
      return (
        right.count - left.count ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    if (state.sort === "depth")
      return (
        right.depth - left.depth ||
        right.worst - left.worst ||
        left.key.localeCompare(right.key)
      );
    return right.worst - left.worst || left.key.localeCompare(right.key);
  });
  return rows;
}

export function entryTypeCountsByFile(
  report: Workspace | undefined,
): Map<string, EntryCounts> {
  const counts = new Map<string, EntryCounts>();
  for (const file of report?.files ?? []) counts.set(file.path, {
    boundaries: file.entries.boundaries, relays: file.entries.relays,
    unknown: file.entries.unknownEdges, fanOut: file.entries.fanOutSources,
  });
  return counts;
}

export function emptyEntryCounts(): EntryCounts {
  return { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
}


function isOverviewFilter(value: string | null): value is OverviewFilter {
  return (
    value === "all" ||
    value === "findings" ||
    value === "unknown" ||
    value === "participating"
  );
}

function isOverviewSort(value: string | null): value is OverviewSort {
  return (
    value === "burden" ||
    value === "findings" ||
    value === "depth" ||
    value === "file"
  );
}
