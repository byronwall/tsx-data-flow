import type { RouteDataDetail, RouteTotality } from "../../../api/contracts";
import {
  routeInvestigationSelectionForNode,
  type RouteInvestigationSelection,
} from "./route-investigation-selection";
import type { RouteTotalityLayout, RouteTotalityLayoutNode } from "./route-totality-model";

type RouteDataSourceEvidence = RouteDataDetail["evidence"][number];
type AvailableEvidence = Extract<RouteTotality["evidenceSlice"], { elements: unknown[] }>;
type RouteTotalityOrigin = RouteTotality["fieldLineage"]["attachments"][number]["origin"];

export type RouteTotalitySourceFocus = RouteTotalityOrigin | null;

export function exactRouteTotalityOriginForSource(
  totality: RouteTotality | null,
  evidence: RouteDataSourceEvidence | null,
): RouteTotalitySourceFocus {
  if (!totality || !evidence || !("origins" in totality.evidenceSlice) || !("elements" in totality.evidenceSlice)) return null;
  const slice: AvailableEvidence = totality.evidenceSlice;
  const ledgerOrigins = uniqueOrigins(totality.fieldLineage.attachments.map((attachment) => attachment.origin)
    .concat(totality.fieldLineage.frontiers.map((frontier) => frontier.origin))
    .filter((origin) => origin.selectedEvidenceId === evidence.id));
  if (ledgerOrigins.length > 0) {
    const exact = ledgerOrigins.filter((origin) => slice.origins.some((candidate) => (
      candidate.elementId === origin.elementId && candidate.role === origin.role && candidate.status === "proven"
    )));
    return exact.length === 1 ? exact[0] : null;
  }
  const matches = slice.origins.filter((origin) => {
    if (origin.status !== "proven") return false;
    const element = slice.elements.find((candidate) => candidate.id === origin.elementId);
    return element?.status === "proven" && exactLocation(element.location, evidence);
  });
  return matches.length === 1
    ? { elementId: matches[0].elementId, role: matches[0].role, selectedEvidenceId: null }
    : null;
}

function uniqueOrigins(origins: readonly RouteTotalityOrigin[]): RouteTotalityOrigin[] {
  return [...new Map(origins.map((origin) => [
    `${origin.elementId}:${origin.role}:${origin.selectedEvidenceId ?? ""}`,
    origin,
  ])).values()];
}

/**
 * Select only the one visible origin mark for an already proven source origin.
 *
 * The layout may contain several origin roles for one evidence element. Keep the
 * role in the match so the controlled selection cannot attach by label or ID
 * prefix alone.
 */
export function exactRouteTotalityOriginSelection(
  layout: RouteTotalityLayout,
  origin: RouteTotalitySourceFocus,
): RouteInvestigationSelection {
  if (!origin) return null;
  const matches = (layout.nodes as RouteTotalityLayoutNode[]).filter((node) => (
    node.kind === "origin"
    && "elementId" in node.record
    && "role" in node.record
    && node.record.elementId === origin.elementId
    && node.record.role === origin.role
  ));
  return matches.length === 1 ? routeInvestigationSelectionForNode(matches[0]) : null;
}

function exactLocation(
  left: AvailableEvidence["elements"][number]["location"],
  right: RouteDataSourceEvidence,
): boolean {
  if (!isSourceLocation(left)) return false;
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function isSourceLocation(value: unknown): value is {
  file: string;
  line: number;
  column: number;
  span: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
} {
  if (!value || typeof value !== "object") return false;
  const location = value as Record<string, unknown>;
  const span = location.span;
  if (!span || typeof span !== "object") return false;
  const sourceSpan = span as Record<string, unknown>;
  return typeof location.file === "string"
    && typeof location.line === "number"
    && typeof location.column === "number"
    && typeof sourceSpan.startLine === "number"
    && typeof sourceSpan.startColumn === "number"
    && typeof sourceSpan.endLine === "number"
    && typeof sourceSpan.endColumn === "number";
}
