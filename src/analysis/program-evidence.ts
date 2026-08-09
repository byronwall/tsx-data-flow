import path from "node:path";
import * as TypeScript from "typescript";
import type { SourceSpan } from "../types";
import { ProgramEvidenceCollector } from "./program-evidence-collector";
import { programForRoot } from "./program-evidence-loading";
import type { CompactProgramFact } from "./program-evidence-compact-facts";
import type {
  ProgramEvidenceDeclarationCatalog,
  ProgramEvidenceDeclarationCatalogImportStats,
} from "./program-evidence-declaration-catalog";
import type { AnalysisCancellationToken } from "./cancellation";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";
export type EvidenceConfidence = "proven" | "partial";
export type ProgramEvidenceLocation = {
  file: string;
  line: number;
  column: number;
  span: SourceSpan;
};
export type ProgramProofKind =
  | "ast-node"
  | "compiler-symbol"
  | "argument-binding"
  | "return-expression"
  | "property-access"
  | "jsx-tag"
  | "component-prop-binding"
  | "host-api"
  | "resource-boundary"
  | "partial-classification"
  | "http-bridge";
export type ProgramProof = {
  kind: ProgramProofKind;
  detail: string;
  locations: ProgramEvidenceLocation[];
};
export type ProgramOperationKind =
  | "alias"
  | "field-read"
  | "index-read"
  | "destructure"
  | "pick"
  | "omit"
  | "object-pack"
  | "object-spread"
  | "field-rename"
  | "map"
  | "filter"
  | "reduce"
  | "aggregate"
  | "parse"
  | "validate"
  | "serialize"
  | "default"
  | "selection"
  | "type-narrow"
  | "resource";
export type ProgramElementKind =
  | "source-file"
  | "function-entry"
  | "handler-entry"
  | "component-definition"
  | "parameter"
  | "value"
  | "literal"
  | "alias"
  | "call"
  | "return"
  | "field-read"
  | "index-read"
  | "object-pack"
  | "selection"
  | "validation"
  | "serialization"
  | "parse"
  | "type-narrow"
  | "jsx-occurrence"
  | "component-occurrence"
  | "component-prop-binding"
  | "dom-terminal"
  | "render-terminal"
  | "environment-input"
  | "process-input"
  | "file-input"
  | "fetch-input"
  | "resource-input"
  | "resource-result"
  | "stdout"
  | "stderr"
  | "exit-status"
  | "file-write"
  | "http-response"
  | "network-request"
  | "external-read"
  | "message"
  | "external-effect";
export type ProgramRelationKind =
  | "contains"
  | "declares-parameter"
  | "definition"
  | "references"
  | "invokes"
  | "argument"
  | "argument-binding"
  | "return-expression"
  | "return-value"
  | "performs"
  | "field-input"
  | "pack-field"
  | "renders"
  | "component-occurrence"
  | "component-prop"
  | "component-prop-binding"
  | "render-terminal"
  | "input-call"
  | "resource-loader"
  | "resource-result"
  | "effect-input"
  | "http-bridge";
export type ProgramEvidenceGapReason =
  | "unsupported-syntax"
  | "dynamic-dispatch"
  | "external-code"
  | "identity-lost"
  | "unresolved-symbol";
export type ProgramElement = {
  id: string;
  kind: ProgramElementKind;
  operationKind: ProgramOperationKind | null;
  label: string;
  expression: string | null;
  location: ProgramEvidenceLocation;
  symbolId: string | null;
  typeId: string | null;
  module: string | null;
  definitionId: string | null;
  ownerId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  componentBinding: ComponentBindingMetadata | null;
  confidence: EvidenceConfidence;
  proof: ProgramProof;
};
export type ProgramRelation = {
  id: string;
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: ProgramEvidenceLocation[];
  proof: ProgramProof;
  confidence: EvidenceConfidence;
};
export type ProgramEvidenceGap = {
  id: string;
  from: string;
  to: string | null;
  direction: "forward" | "backward";
  reason: ProgramEvidenceGapReason;
  detail: string;
  location: ProgramEvidenceLocation | null;
};
export type ProgramEvidenceIndexes = {
  elementsById: ReadonlyMap<string, ProgramElement>;
  relationsById: ReadonlyMap<string, ProgramRelation>;
  outgoingRelationIds: ReadonlyMap<string, readonly string[]>;
  incomingRelationIds: ReadonlyMap<string, readonly string[]>;
  elementIdsByKind: ReadonlyMap<ProgramElementKind, readonly string[]>;
  elementIdsByFile: ReadonlyMap<string, readonly string[]>;
  elementIdsBySymbolId: ReadonlyMap<string, readonly string[]>;
  relationIdsByKind: ReadonlyMap<ProgramRelationKind, readonly string[]>;
  operationIdsByKind: ReadonlyMap<ProgramOperationKind, readonly string[]>;
};
export type ProgramEvidence = {
  elements: ProgramElement[];
  relations: ProgramRelation[];
  gaps: ProgramEvidenceGap[];
  sourceFiles: string[];
  indexes: ProgramEvidenceIndexes;
  coverage: {
    sourceFiles: number;
    elements: number;
    relations: number;
    provenRelations: number;
    partialRelations: number;
    gaps: number;
  };
};
export type ProgramEvidenceOptions = {
  includeDeclarationFiles?: boolean;
  sourceFiles?: readonly TypeScript.SourceFile[];
  declarationCatalog?: ProgramEvidenceDeclarationCatalog;
  cancellation?: AnalysisCancellationToken;
};

export type ProgramEvidenceMemorySample = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
};

export type ProgramEvidencePhaseName =
  | "declarations"
  | "nodes"
  | "connectCalls"
  | "connectPendingReferences"
  | "renderComponents"
  | "connectHttpBridges";

export type ProgramEvidencePhaseStats = {
  calls: number;
  elapsedMs: number;
  inputCount: number;
  outputCount: number;
  memoryStart: ProgramEvidenceMemorySample | null;
  memoryEnd: ProgramEvidenceMemorySample | null;
};

export type ProgramEvidenceRelationStats = {
  candidateCalls: number;
  acceptedCandidates: number;
  proofCount: number;
  proofLocationCount: number;
  locationCalls: number;
  locationElapsedMs: number;
  relationIdCalls: number;
  relationIdElapsedMs: number;
  sinkCalls: number;
  sinkElapsedMs: number;
  retainedRecipes: number;
};

export type CollectedProgramFacts = {
  /** Compact records used by the lazy provider. Full elements are hydrated by ID. */
  facts: CompactProgramFact[];
  gaps: ProgramEvidenceGap[];
  sourceFiles: string[];
};

export type ProgramEvidenceCollectionStats = {
  sourceFilesVisited: number;
  astUnitsVisited: number;
  phases: Record<ProgramEvidencePhaseName, ProgramEvidencePhaseStats>;
  relation: ProgramEvidenceRelationStats;
  declarationCatalog: ProgramEvidenceDeclarationCatalogImportStats;
};

export const EvidenceCollector = ProgramEvidenceCollector;
export type EvidenceCollector = ProgramEvidenceCollector;

export function collectProgramEvidence(fixtureRoot: string, options?: ProgramEvidenceOptions): ProgramEvidence;
export function collectProgramEvidence(ts: typeof TypeScript, program: TypeScript.Program, root: string, options?: ProgramEvidenceOptions): ProgramEvidence;
export function collectProgramEvidence(
  first: string | typeof TypeScript,
  second?: TypeScript.Program | ProgramEvidenceOptions,
  third?: string,
  fourth: ProgramEvidenceOptions = {},
): ProgramEvidence {
  if (typeof first === "string") {
    const root = path.resolve(first);
    const options = (second as ProgramEvidenceOptions | undefined) ?? {};
    return new EvidenceCollector(TypeScript, programForRoot(root), root, options).collect();
  }
  return new EvidenceCollector(
    first,
    second as TypeScript.Program,
    third as string,
    fourth,
  ).collect();
}

export const buildProgramEvidence = collectProgramEvidence;

export async function collectProgramEvidenceForRoot(root: string): Promise<ProgramEvidence> {
  return collectProgramEvidence(root);
}

export function forwardRelations(
  evidence: ProgramEvidence,
  elementId: string,
  limit = Number.POSITIVE_INFINITY,
) {
  return relationIds(evidence, evidence.indexes.outgoingRelationIds.get(elementId) ?? [], limit);
}

export function backwardRelations(
  evidence: ProgramEvidence,
  elementId: string,
  limit = Number.POSITIVE_INFINITY,
) {
  return relationIds(evidence, evidence.indexes.incomingRelationIds.get(elementId) ?? [], limit);
}

function relationIds(
  evidence: ProgramEvidence,
  ids: readonly string[],
  limit: number,
) {
  return ids
    .slice(0, Math.max(0, limit))
    .map((id) => evidence.indexes.relationsById.get(id))
    .filter(
      (relation): relation is ProgramRelation => Boolean(relation),
    );
}
