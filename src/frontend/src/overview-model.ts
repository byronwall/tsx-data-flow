import type { AnalysisReport, RootInfo, Sink } from "../../types";

type Report = AnalysisReport;
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
  worstSink: Sink | null;
  shape: string;
  ownership: string;
  firstCut: string;
}
interface OverviewGroup {
  key: string;
  count: number;
  worst: number;
  depth: number;
  shapes: string[];
  ownership: string[];
  worstSink: Sink | null;
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
  report: Report | undefined,
  state: OverviewState,
): OverviewRow[] {
  if (!report) return [];
  const participating = graphParticipationFiles(report);
  const q = state.q.toLowerCase();
  const typeCounts = entryTypeCountsByFile(report);
  const groups = new Map<string, OverviewGroup>();
  for (const sink of report.sinks ?? []) {
    if (!sink.file) continue;
    const group = groups.get(sink.file) ?? {
      key: sink.file,
      count: 0,
      worst: 0,
      depth: 0,
      shapes: [],
      ownership: [],
      worstSink: null,
    };
    group.count += 1;
    const burden = sink.scores?.burden ?? 0;
    if (burden > group.worst) {
      group.worst = burden;
      group.worstSink = sink;
    }
    group.depth = Math.max(group.depth, sink.metrics?.maximumPathDepth ?? 0);
    group.shapes.push(shapeOf(sink));
    group.ownership.push(ownershipOf(sink));
    groups.set(sink.file, group);
  }
  let rows = [...groups.values()].map((group) => ({
    ...group,
    shape: modalValue(group.shapes),
    ownership: modalValue(group.ownership),
    firstCut: firstCutFor(group.worstSink),
  }));
  rows = rows.filter((row) => {
    const counts = typeCounts.get(row.key) ?? emptyEntryCounts();
    if (state.filter === "findings" && row.count <= 0) return false;
    if (state.filter === "unknown" && !counts.unknown) return false;
    if (state.filter === "participating" && !participating.has(row.key))
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
  report: Report | undefined,
): Map<string, EntryCounts> {
  const counts = new Map<string, EntryCounts>();
  const bump = (file: string | undefined, key: EntryCountKey) => {
    if (!file) return;
    const next = counts.get(file) ?? {
      boundaries: 0,
      relays: 0,
      unknown: 0,
      fanOut: 0,
    };
    next[key] += 1;
    counts.set(file, next);
  };
  for (const helper of report?.helpers ?? []) bump(helper.file, "boundaries");
  for (const relay of report?.contextRelay ?? [])
    bump(relay.parentFile, "relays");
  for (const edge of report?.unknownEdges ?? []) bump(edge.file, "unknown");
  const roots = new Map<string, { count: number; files: Set<string> }>();
  for (const sink of report?.sinks ?? []) {
    if (!sink.file) continue;
    for (const root of sink.roots ?? []) {
      const entry = roots.get(root) ?? { count: 0, files: new Set() };
      entry.count += 1;
      entry.files.add(sink.file);
      roots.set(root, entry);
    }
  }
  for (const entry of roots.values()) {
    if (entry.count < 2) continue;
    for (const file of entry.files) bump(file, "fanOut");
  }
  return counts;
}

function graphParticipationFiles(report: Report): Set<string> {
  const files = new Set<string>();
  for (const node of report?.graph?.nodes ?? [])
    if (node.file) files.add(node.file);
  for (const edge of report?.graph?.edges ?? [])
    if (edge.location?.file) files.add(edge.location.file);
  if (files.size === 0) {
    for (const sink of report?.sinks ?? []) if (sink.file) files.add(sink.file);
  }
  return files;
}

function modalValue(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return (
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "—"
  );
}

export function emptyEntryCounts(): EntryCounts {
  return { boundaries: 0, relays: 0, unknown: 0, fanOut: 0 };
}

function shapeOf(sink: Sink): string {
  return (
    sink.advice?.primaryShape ??
    sink.advice?.shape ??
    sink.family ??
    "uncategorized"
  );
}

function ownershipOf(sink: Sink): string {
  if ((sink.roots ?? []).some((root: string) => /^use[A-Z]/.test(root)))
    return "feature hook/context";
  if ((sink.rootInfos ?? []).some((source: RootInfo) => source.kind === "prop-read"))
    return "props";
  return "local";
}

function firstCutFor(sink: Sink | null): string {
  return (
    sink?.advice?.firstCut ?? sink?.advice?.headline ?? "local boundary cleanup"
  );
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


