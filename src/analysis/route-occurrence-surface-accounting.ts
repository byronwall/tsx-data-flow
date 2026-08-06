import type * as TypeScript from "typescript";
import type { RouteOccurrenceLocation, RouteOccurrenceOmission, RouteOccurrenceOmissionReason } from "./route-occurrence-surface";
import { locationForNode, stableIdentity } from "./route-occurrence-support";

export type RouteOccurrenceBudgetSet = {
  definitions: number;
  occurrences: number;
  boundaries: number;
  edges: number;
  terminals: number;
  omissions: number;
  depth: number;
};

export type RouteOccurrenceTruncation = {
  definitions: boolean;
  occurrences: boolean;
  boundaries: boolean;
  edges: boolean;
  terminals: boolean;
  omissions: boolean;
};

export const DEFAULT_ROUTE_OCCURRENCE_BUDGETS: RouteOccurrenceBudgetSet = {
  definitions: 512,
  occurrences: 4_096,
  boundaries: 1_024,
  edges: 8_192,
  terminals: 8_192,
  omissions: 256,
  depth: 48,
};

export class RouteOccurrenceAccounting {
  public readonly omissions = new Map<string, RouteOccurrenceOmission>();
  public readonly truncated: RouteOccurrenceTruncation = {
    definitions: false,
    occurrences: false,
    boundaries: false,
    edges: false,
    terminals: false,
    omissions: false,
  };
  public discoveredDefinitions = 0;
  public discoveredOccurrences = 0;
  public discoveredBoundaries = 0;
  public discoveredTerminals = 0;

  constructor(
    private readonly root: string,
    private readonly scopeId: string,
    public readonly budgets: RouteOccurrenceBudgetSet,
  ) {}

  public discover(kind: "definitions" | "occurrences" | "boundaries" | "terminals") {
    if (kind === "definitions") this.discoveredDefinitions += 1;
    if (kind === "occurrences") this.discoveredOccurrences += 1;
    if (kind === "boundaries") this.discoveredBoundaries += 1;
    if (kind === "terminals") this.discoveredTerminals += 1;
  }

  public allow(kind: "definitions" | "occurrences" | "boundaries" | "edges" | "terminals", emitted: number, node: TypeScript.Node | null) {
    if (emitted < this.budgets[kind]) return true;
    this.truncated[kind] = true;
    const labels = {
      definitions: "Definition emission budget exhausted.",
      occurrences: "Occurrence emission budget exhausted.",
      boundaries: "Framework boundary emission budget exhausted.",
      edges: "Render edge emission budget exhausted.",
      terminals: "Terminal emission budget exhausted.",
    } as const;
    this.omit("budget-exhausted", labels[kind], node);
    return false;
  }

  public omit(reason: RouteOccurrenceOmissionReason, label: string, node: TypeScript.Node | RouteOccurrenceLocation | null, count = 1) {
    const key = `${reason}:${label}`;
    const existing = this.omissions.get(key);
    const location = node && "span" in node ? node : node ? locationForNode(this.root, node) : null;
    if (existing) {
      existing.count += count;
      if (location && !existing.locations.some((candidate) => sameLocation(candidate, location))) existing.locations.push(location);
      return;
    }
    if (this.omissions.size >= this.budgets.omissions) {
      this.truncated.omissions = true;
      return;
    }
    this.omissions.set(key, {
      id: stableIdentity("route-omission", [reason, label, this.scopeId]),
      reason,
      label,
      count,
      locations: location ? [location] : [],
    });
  }
}

export function positiveBudget(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function sameLocation(left: RouteOccurrenceLocation, right: RouteOccurrenceLocation) {
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}
