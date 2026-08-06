import type * as TypeScript from "typescript";
import type { SourceSpan } from "../types";
import { projectTransparentWrapper, type TransparentWrapperProjection } from "./transparent-wrapper-occurrence-projection";
import {
  TARGET_ROUTE,
  collectOccurrences,
  componentSourceIdentity,
  definitionFor,
  isTransparentLayout,
  occurrenceFor,
  selectedComponentPair,
  selectedFiles,
  siblingDiagnostic,
  sourcePathDiagnostic,
  locationForNode,
} from "./component-occurrence-identity-support";

const OCCURRENCE_DEFINITION_LIMIT = 24;
const OCCURRENCE_LIMIT = 96;
const OCCURRENCE_EDGE_LIMIT = 128;
const OCCURRENCE_HIDDEN_PATH_LIMIT = 16;
const OCCURRENCE_GAP_LIMIT = 16;

export type CompilerLocation = { file: string; line: number; column: number; span: SourceSpan };
export type ComponentDefinition = { id: string; name: string; compilerIdentity: string; importModule: string | null; declaration: CompilerLocation | null };
export type ComponentOccurrence = {
  id: string;
  callSiteId: string;
  definitionId: string;
  definitionCompilerIdentity: string;
  name: string;
  parentOccurrenceId: string | null;
  callerOwnedChildOccurrenceIds: string[];
  scopeId: string;
  callSite: CompilerLocation;
  ownership: "scope-entry" | "caller-owned";
  repetition: "single";
};
export type SourcePathSeed = {
  sourceOccurrenceId: string;
  sourceCompilerIdentity: string;
  sourceLocation: CompilerLocation;
  terminalLocation: CompilerLocation;
  scopeId: string;
  proof: { kind: "compiler-backed-route-slice"; detail: string; locations: CompilerLocation[] };
};
export type OccurrenceDiagnosticGap = { reason: "unresolved-symbol" | "identity-lost" | "unsupported-syntax"; label: string; location: CompilerLocation | null };
export type SourcePathDiagnostic = {
  status: "proven" | "unavailable" | "invalid";
  sourceOccurrenceId: string | null;
  sourceCompilerIdentity: string | null;
  sourceLocation: CompilerLocation | null;
  terminalLocation: CompilerLocation | null;
  scopeId: string | null;
  occurrenceIds: string[];
  detail: string;
};
export type SiblingIsolationDiagnostic = {
  selectedWrapperOccurrenceId: string;
  siblingWrapperOccurrenceId: string;
  sameDefinition: boolean;
  selectedChildOccurrenceIds: string[];
  siblingChildOccurrenceIds: string[];
  siblingReceivedSelectedChildren: boolean;
  siblingInSourcePath: boolean;
};
export type PluckComponentOccurrenceDiagnostic = {
  status: "proven" | "partial" | "unavailable";
  scopeId: string;
  route: { pathPattern: string; entryFile: string };
  component: { definition: ComponentDefinition; occurrence: ComponentOccurrence } | null;
  terminal: CompilerLocation | null;
  definitions: ComponentDefinition[];
  occurrences: ComponentOccurrence[];
  sourcePath: SourcePathDiagnostic;
  selectedWrapperOccurrenceId: string | null;
  projection: TransparentWrapperProjection | null;
  siblingIsolation: SiblingIsolationDiagnostic | null;
  gaps: OccurrenceDiagnosticGap[];
  truncation: { definitions: boolean; occurrences: boolean; edges: boolean; hiddenPaths: boolean; gaps: boolean };
};

export function buildPluckComponentOccurrenceDiagnostic(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  sourcePathSeed: SourcePathSeed | null = null,
  scopeId = sourcePathSeed?.scopeId ?? `route:${TARGET_ROUTE}`,
): PluckComponentOccurrenceDiagnostic {
  const checker = program.getTypeChecker();
  const { componentFile, entryFile } = selectedFiles(program);
  const gaps: OccurrenceDiagnosticGap[] = [];
  if (!componentFile || !entryFile) gaps.push({ reason: "unresolved-symbol", label: "The selected Pluck component or its caller is not in the compiler program.", location: null });
  const pair = selectedComponentPair(ts, checker, componentFile, entryFile);
  const { componentDeclaration, componentSymbol, componentCall } = pair;
  if (!componentDeclaration || !componentSymbol || !componentCall) gaps.push({ reason: "unresolved-symbol", label: "The CaptureStatsPanel definition and compiler-resolved call site could not be paired.", location: componentCall ? locationForNode(root, componentCall) : null });
  const componentDefinition = componentSymbol ? definitionFor(checker, componentSymbol, root, null) : null;
  const componentOccurrence = componentDefinition && componentCall ? occurrenceFor(root, componentDefinition, componentCall, null, scopeId, "scope-entry") : null;
  const sourceIdentity = componentSourceIdentity(ts, checker, program, root);
  const collected = componentDeclaration && componentDefinition && componentOccurrence
    ? collectOccurrences(ts, checker, root, componentDeclaration, componentDefinition, componentOccurrence)
    : { definitions: componentDefinition ? [componentDefinition] : [], occurrences: componentOccurrence ? [componentOccurrence] : [], terminal: null, pathIds: [] };
  const terminal = collected.terminal;
  if (!terminal) gaps.push({ reason: "unresolved-symbol", label: "The selected CaptureStatsPanel terminal was not found at its compiler location.", location: componentDeclaration ? locationForNode(root, componentDeclaration) : null });
  const wrapper = collected.pathIds.map((id) => collected.occurrences.find((occurrence) => occurrence.id === id)).filter((occurrence): occurrence is ComponentOccurrence => Boolean(occurrence)).reverse().find((occurrence) => isTransparentLayout(occurrence, collected.definitions));
  const sibling = wrapper ? collected.occurrences.find((occurrence) => occurrence.id !== wrapper.id && occurrence.definitionId === wrapper.definitionId && occurrence.parentOccurrenceId === wrapper.parentOccurrenceId) : null;
  if (!wrapper) gaps.push({ reason: "identity-lost", label: "No compiler-resolved transparent Pluck layout occurrence contains the selected terminal.", location: terminal });
  if (wrapper && !sibling) gaps.push({ reason: "identity-lost", label: "The selected transparent layout definition has no sibling call site for isolation evidence.", location: wrapper.callSite });
  const sourcePath = sourcePathDiagnostic(terminal, collected.pathIds, sourcePathSeed, scopeId, sourceIdentity);
  if (sourcePath.status !== "proven") gaps.push({ reason: sourcePath.status === "invalid" ? "identity-lost" : "unsupported-syntax", label: sourcePath.detail, location: sourcePath.terminalLocation });
  const projection = wrapper ? projectTransparentWrapper(collected.occurrences, wrapper.id, sourcePath.occurrenceIds) : null;
  const siblingIsolation = wrapper && sibling && projection ? siblingDiagnostic(wrapper, sibling, projection, sourcePath.occurrenceIds, collected.occurrences) : null;
  if (siblingIsolation?.siblingReceivedSelectedChildren || siblingIsolation?.siblingInSourcePath) gaps.push({ reason: "identity-lost", label: "The sibling wrapper received selected caller children or the selected source path.", location: sibling?.callSite ?? null });
  const truncation = { definitions: collected.definitions.length > OCCURRENCE_DEFINITION_LIMIT, occurrences: collected.occurrences.length > OCCURRENCE_LIMIT, edges: Boolean(projection && projection.visibleEdges.length > OCCURRENCE_EDGE_LIMIT), hiddenPaths: Boolean(projection && projection.hiddenPaths.length > OCCURRENCE_HIDDEN_PATH_LIMIT), gaps: gaps.length > OCCURRENCE_GAP_LIMIT };
  const emittedOccurrences = collected.occurrences.slice(0, OCCURRENCE_LIMIT);
  const emittedIds = new Set(emittedOccurrences.map((occurrence) => occurrence.id));
  const emittedComponentOccurrence = componentOccurrence ? emittedOccurrences.find((occurrence) => occurrence.id === componentOccurrence.id) ?? componentOccurrence : null;
  const boundedProjection = projection ? {
    ...projection,
    visibleEdges: projection.visibleEdges.slice(0, OCCURRENCE_EDGE_LIMIT),
    hiddenPaths: projection.hiddenPaths.slice(0, OCCURRENCE_HIDDEN_PATH_LIMIT).map((hiddenPath) => ({ ...hiddenPath, callerOwnedChildOccurrenceIds: hiddenPath.callerOwnedChildOccurrenceIds.slice(0, OCCURRENCE_LIMIT), hiddenEdges: hiddenPath.hiddenEdges.slice(0, OCCURRENCE_EDGE_LIMIT) })),
    reattachedChildOccurrenceIds: projection.reattachedChildOccurrenceIds.slice(0, OCCURRENCE_LIMIT),
  } : null;
  const status = gaps.length || Object.values(truncation).some(Boolean) ? (componentOccurrence ? "partial" : "unavailable") : "proven";
  return {
    status,
    scopeId,
    route: { pathPattern: TARGET_ROUTE, entryFile: "app/src/components/pluck/viewer/CaptureInspectorPanel.tsx" },
    component: componentDefinition && emittedComponentOccurrence ? { definition: componentDefinition, occurrence: emittedComponentOccurrence } : null,
    terminal,
    definitions: collected.definitions.slice(0, OCCURRENCE_DEFINITION_LIMIT),
    occurrences: emittedOccurrences,
    sourcePath: { ...sourcePath, occurrenceIds: sourcePath.occurrenceIds.filter((id) => emittedIds.has(id)) },
    selectedWrapperOccurrenceId: wrapper?.id ?? null,
    projection: boundedProjection,
    siblingIsolation: siblingIsolation ? { ...siblingIsolation, selectedChildOccurrenceIds: siblingIsolation.selectedChildOccurrenceIds.slice(0, OCCURRENCE_LIMIT), siblingChildOccurrenceIds: siblingIsolation.siblingChildOccurrenceIds.slice(0, OCCURRENCE_LIMIT) } : null,
    gaps: gaps.slice(0, OCCURRENCE_GAP_LIMIT),
    truncation,
  };
}
