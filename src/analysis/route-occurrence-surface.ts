import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type { SourceSpan } from "../types";
import type { RouteRecord } from "./route-data";
import { RouteOccurrenceSurfaceBuilder } from "./route-occurrence-surface-builder";

export type RouteOccurrenceRepetition = "single" | "conditional" | "collection" | "unknown";
export type RouteOccurrenceOwnership = "scope-entry" | "caller-owned" | "definition-owned";
export type RouteFrameworkBoundaryKind = "portal" | "control-flow" | "collection" | "suspense-async" | "unsupported-ownership";
export type RouteConditionOutcome = "truthy" | "falsey" | "unknown";
export type RouteOccurrenceOmissionReason = "budget-exhausted" | "recursion-limit" | "unsupported-syntax" | "unsupported-ownership" | "unresolved-symbol" | "dynamic-dispatch" | "external-code" | "identity-lost";
export type RouteOccurrenceLocation = { file: string; line: number; column: number; span: SourceSpan };
export type RouteSlotExpressionKind = "props.children" | "children-parameter" | "named-slot";
export type RouteSlotExpression = { kind: RouteSlotExpressionKind; label: string };

export type RouteOccurrenceDefinition = {
  id: string;
  name: string;
  compilerIdentity: string;
  sourceIdentity: string;
  sourceFile: string | null;
  importModule: string | null;
  declaration: RouteOccurrenceLocation | null;
  external: boolean;
};

export type RouteRenderOccurrence = {
  id: string;
  key: string;
  callSiteId: string;
  definitionId: string;
  definitionSourceIdentity: string;
  definitionCompilerIdentity: string;
  name: string;
  expression: string;
  parentOccurrenceId: string | null;
  renderParentId: string | null;
  scopeId: string;
  scopeSeed: string;
  callSite: RouteOccurrenceLocation;
  ownership: RouteOccurrenceOwnership;
  repetition: RouteOccurrenceRepetition;
  repetitionMarkers: Array<"conditional" | "collection">;
  runtimeMultiplicity: "unknown";
  staticCallSiteCount: 1;
  callerOwnedChildOccurrenceIds: string[];
  definitionOwnedChildOccurrenceIds: string[];
  slotForwardingIds: string[];
  frameworkBoundaryIds: string[];
  hiddenWrapperCompatibility: boolean;
};

export type RouteFrameworkBoundary = {
  id: string;
  key: string;
  name: string;
  kind: RouteFrameworkBoundaryKind;
  scopeId: string;
  scopeSeed: string;
  parentOccurrenceId: string | null;
  renderParentId: string | null;
  location: RouteOccurrenceLocation;
  repetition: RouteOccurrenceRepetition;
  repetitionMarkers: Array<"conditional" | "collection">;
  runtimeMultiplicity: "unknown";
  childOccurrenceIds: string[];
  fallbackChildOccurrenceIds: string[];
  sourceExpression: string | null;
  sourceLocation: RouteOccurrenceLocation | null;
  sourceBacked: boolean | null;
  condition: {
    outcome: RouteConditionOutcome;
    detail: string;
    locations: RouteOccurrenceLocation[];
  } | null;
  ownership: "framework-owned";
};

export type RouteOccurrenceEdge = {
  id: string;
  from: string;
  to: string;
  kind: "render" | "framework-boundary" | "slot-forward" | "transparent-splice";
  locations: RouteOccurrenceLocation[];
  detail: string;
};

export type RouteSlotForwarding = {
  id: string;
  occurrenceId: string;
  kind: RouteSlotExpressionKind;
  evidence: RouteSlotExpression;
  definitionSourceIdentity: string;
  sourceLocation: RouteOccurrenceLocation;
  callerChildOccurrenceIds: string[];
  sourceBacked: boolean;
  detail: string;
};

export type RouteTerminalOccurrence = {
  id: string;
  kind: "jsx-text" | "dom-attribute" | "style" | "render-expression";
  ownerOccurrenceId: string | null;
  renderParentId: string | null;
  location: RouteOccurrenceLocation;
  label: string;
  expression: string | null;
  repetition: RouteOccurrenceRepetition;
  runtimeMultiplicity: "unknown";
};

export type RouteOccurrenceOmission = { id: string; reason: RouteOccurrenceOmissionReason; label: string; count: number; locations: RouteOccurrenceLocation[] };
export type HiddenWrapperCompatibilityOccurrence = { occurrenceId: string; definitionId: string; name: string; callSite: RouteOccurrenceLocation; detail: string };
export type RouteOccurrenceTotals = {
  definitions: number;
  emittedDefinitions: number;
  totalOccurrences: number;
  emittedOccurrences: number;
  repeatedSites: number;
  conditionalSites: number;
  collectionSites: number;
  frameworkBoundaries: number;
  hiddenWrapperCompatibilityOccurrences: number;
  terminalOccurrences: number;
  namedOmissions: number;
  omittedItems: number;
};

export type RouteOccurrenceSurface = {
  id: string;
  status: "complete" | "partial" | "unavailable";
  route: { key: string; pathPattern: string; file: string };
  scope: { id: string; seed: string };
  definitions: RouteOccurrenceDefinition[];
  occurrences: RouteRenderOccurrence[];
  frameworkBoundaries: RouteFrameworkBoundary[];
  renderEdges: RouteOccurrenceEdge[];
  slotForwarding: RouteSlotForwarding[];
  hiddenWrapperCompatibility: HiddenWrapperCompatibilityOccurrence[];
  terminals: RouteTerminalOccurrence[];
  omissions: RouteOccurrenceOmission[];
  totals: RouteOccurrenceTotals;
  truncation: { definitions: boolean; occurrences: boolean; boundaries: boolean; edges: boolean; terminals: boolean; omissions: boolean };
};

export type RouteOccurrenceSurfaceOptions = {
  scopeId?: string;
  scopeSeed?: string;
  maxDefinitions?: number;
  maxOccurrences?: number;
  maxBoundaries?: number;
  maxEdges?: number;
  maxTerminals?: number;
  maxDepth?: number;
  maxOmissions?: number;
  includeIntrinsicTerminals?: boolean;
  cancellation?: AnalysisCancellationToken;
};

export function buildRouteOccurrenceSurface(ts: typeof TypeScript, program: TypeScript.Program, root: string, route: RouteRecord, options: RouteOccurrenceSurfaceOptions = {}) {
  return new RouteOccurrenceSurfaceBuilder(ts, program, root, route, options).build();
}

export const buildRouteWideOccurrenceSurface = buildRouteOccurrenceSurface;
