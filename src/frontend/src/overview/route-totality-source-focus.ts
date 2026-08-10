import type { RouteDataDetail, RouteTotality } from "../../../api/contracts";

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
  const matches = slice.origins.filter((origin) => {
    if (origin.status !== "proven") return false;
    const element = slice.elements.find((candidate) => candidate.id === origin.elementId);
    return element?.status === "proven" && exactLocation(element.location, evidence);
  });
  return matches.length === 1
    ? { elementId: matches[0].elementId, role: matches[0].role }
    : null;
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
