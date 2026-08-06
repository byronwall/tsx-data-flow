import type { RouteTotality } from "../../../api/contracts";
import type {
  RouteTotalityCountSummary,
  RouteTotalityEvidence,
  RouteTotalityGraphEdge,
  RouteTotalityGraphSummary,
  RouteTotalityLayout,
  RouteTotalityNode,
  RouteTotalityNodeKind,
  RouteTotalityNodeSource,
  RouteTotalityOmission,
  RouteTotalitySurface,
} from "./route-totality-model";
import { emptyUiProjection } from "./route-totality-ui-projection";
import { emptyRouteTotalityStackProjection } from "./route-totality-stack-projection";

const COUNT_LABELS: Array<[keyof RouteTotality["counts"], string]> = [
  ["definitions", "Definitions"],
  ["occurrences", "Occurrences"],
  ["edges", "Render edges"],
  ["boundaries", "Framework boundaries"],
  ["origins", "Origins"],
  ["terminals", "Terminals"],
  ["hiddenWrappers", "Hidden wrappers"],
  ["repeated", "Repeated sites"],
  ["conditional", "Conditional sites"],
  ["collection", "Collection sites"],
  ["omissions", "Named omissions"],
  ["omittedItems", "Omitted items"],
  ["evidenceElements", "Evidence elements"],
  ["evidenceRelations", "Evidence relations"],
  ["evidenceOrigins", "Evidence origins"],
  ["evidenceTerminals", "Evidence terminals"],
  ["evidenceGaps", "Evidence gaps"],
];

type Truncation =
  | RouteTotalitySurface["truncation"]
  | RouteTotalityEvidence["coverage"]["truncation"];

export function collectRouteTotalityOmissions(
  totality: RouteTotality,
  surface: RouteTotalitySurface | null,
  evidence: RouteTotalityEvidence | null,
): RouteTotalityOmission[] {
  const omissions: RouteTotalityOmission[] = totality.omissions.map(
    (label, index): RouteTotalityOmission => ({
      id: `omission:route-totality:${index}`,
      source: "route-totality",
      label,
      reason: null,
      count: null,
      status: totality.status === "unavailable" ? "unavailable" : "partial",
      locations: [],
    }),
  );

  if (surface) {
    omissions.push(
      ...surface.omissions.map(
        (item): RouteTotalityOmission => ({
          id: `omission:occurrence-surface:${item.id}`,
          source: "occurrence-surface",
          label: item.label,
          reason: item.reason,
          count: item.count,
          status: "partial",
          locations: item.locations,
        }),
      ),
      ...truncationOmissions("occurrence-surface", surface.truncation),
    );
  } else {
    const reason = unavailableReason(totality.occurrenceSurface);
    if (reason) omissions.push(unavailableOmission("occurrence-surface", reason));
  }

  if (evidence) {
    omissions.push(
      ...evidence.coverage.notes.map(
        (label): RouteTotalityOmission => ({
          id: `omission:evidence-slice:note:${label}`,
          source: "evidence-slice",
          label,
          reason: "coverage-note",
          count: null,
          status: "partial",
          locations: [],
        }),
      ),
      ...truncationOmissions("evidence-slice", evidence.coverage.truncation),
    );
  } else {
    const reason = unavailableReason(totality.evidenceSlice);
    if (reason) omissions.push(unavailableOmission("evidence-slice", reason));
  }

  return omissions;
}

export function buildRouteTotalitySummary(
  totality: RouteTotality,
  nodes: RouteTotalityNode[],
  edges: RouteTotalityGraphEdge[],
  primaryNodeIds: string[],
  evidenceNodeIds: string[],
  omissions: RouteTotalityOmission[],
  unresolvedEdgeIds: string[],
): RouteTotalityGraphSummary {
  const nodeCounts: Record<RouteTotalityNodeKind, number> = {
    origin: countNodes(nodes, "origin"),
    occurrence: countNodes(nodes, "occurrence"),
    "framework-boundary": countNodes(nodes, "framework-boundary"),
    terminal: countNodes(nodes, "terminal"),
    gap: countNodes(nodes, "gap"),
    "evidence-element": countNodes(nodes, "evidence-element"),
  };
  const render = countEdges(edges, "render");
  const data = countEdges(edges, "data");
  const boundary = countEdges(edges, "boundary");

  return {
    status: totality.status,
    statusLabel: statusLabel(totality.status),
    note: statusNote(totality.status),
    route: totality.route,
    counts: totality.counts,
    countSummaries: COUNT_LABELS.map(([key, label]) => (
      countSummary(key, label, totality.counts[key])
    )),
    primaryNodeCount: primaryNodeIds.length,
    evidenceNodeCount: evidenceNodeIds.length,
    nodeCount: nodes.length,
    nodeCounts,
    edgeCounts: {
      render,
      data,
      boundary,
      total: edges.length,
      terminalLinks: edges.filter((edge) => edge.kind === "render-terminal").length,
    },
    unresolvedEdgeIds,
    gapCount: nodeCounts.gap,
    omissions,
  };
}

export function emptyRouteTotalityLayout(): RouteTotalityLayout {
  const nodeCounts: Record<RouteTotalityNodeKind, number> = {
    origin: 0,
    occurrence: 0,
    "framework-boundary": 0,
    terminal: 0,
    gap: 0,
    "evidence-element": 0,
  };
  return {
    nodes: [],
    edges: [],
    primaryNodeIds: [],
    evidenceNodeIds: [],
    summary: {
      status: "unavailable",
      statusLabel: "No route totality",
      note: "No route totality was returned.",
      route: null,
      counts: null,
      countSummaries: [],
      primaryNodeCount: 0,
      evidenceNodeCount: 0,
      nodeCount: 0,
      nodeCounts,
      edgeCounts: {
        render: 0,
        data: 0,
        boundary: 0,
        total: 0,
        terminalLinks: 0,
      },
      unresolvedEdgeIds: [],
      gapCount: 0,
      omissions: [],
    },
    width: 960,
    height: 540,
    uiProjection: emptyUiProjection(),
    stackProjection: emptyRouteTotalityStackProjection(),
    nodeRedirects: new Map(),
  };
}

function countNodes(nodes: RouteTotalityNode[], kind: RouteTotalityNodeKind): number {
  return nodes.filter((node) => node.kind === kind).length;
}

function countEdges(
  edges: RouteTotalityGraphEdge[],
  family: RouteTotalityGraphEdge["family"],
): number {
  return edges.filter((edge) => edge.family === family).length;
}

function countSummary(
  key: keyof RouteTotality["counts"],
  label: string,
  count: RouteTotality["counts"][keyof RouteTotality["counts"]],
): RouteTotalityCountSummary {
  const text = count.totalStatus === "unknown"
    ? `${count.emitted} shown / total unknown`
    : count.totalStatus === "lower-bound"
      ? `${count.emitted} shown / at least ${count.total}`
      : `${count.total}`;
  return {
    key,
    label,
    emitted: count.emitted,
    total: count.total,
    totalStatus: count.totalStatus,
    text,
  };
}

function truncationOmissions(
  source: RouteTotalityNodeSource,
  truncation: Truncation,
): RouteTotalityOmission[] {
  return Object.entries(truncation)
    .filter(([, truncated]) => truncated)
    .map(([key]): RouteTotalityOmission => ({
      id: `omission:${source}:truncation:${key}`,
      source,
      label: `${humanize(source)} truncation: ${humanize(key)}`,
      reason: "truncation",
      count: null,
      status: "partial",
      locations: [],
    }));
}

function unavailableOmission(
  source: RouteTotalityNodeSource,
  label: string,
): RouteTotalityOmission {
  return {
    id: `omission:${source}:unavailable`,
    source,
    label,
    reason: "unavailable",
    count: null,
    status: "unavailable",
    locations: [],
  };
}

function unavailableReason(
  value: RouteTotality["occurrenceSurface"] | RouteTotality["evidenceSlice"],
): string | null {
  return "reason" in value && typeof value.reason === "string" ? value.reason : null;
}

function statusLabel(status: RouteTotality["status"]): string {
  if (status === "complete") return "Complete route totality";
  if (status === "partial") return "Partial route totality";
  return "Route totality unavailable";
}

function statusNote(status: RouteTotality["status"]): string {
  if (status === "complete") return "All returned route surface and evidence are complete.";
  if (status === "partial") {
    return "Named gaps and omissions remain visible; totals are not silently reduced.";
  }
  return "No fallback graph is shown because route totality is unavailable.";
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}
