import * as TypeScript from "typescript";
import type { SourceSpan } from "../types";
import { ProgramEvidenceCollector } from "./program-evidence-collector";
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
  | "carrier-boundary"
  | "awaited-call-alias"
  | "direct-snapshot-member"
  | "expression-body-return"
  | "solid-show-render-prop"
  | "array-find-element"
  | "array-find-callback"
  | "array-find-predicate-return"
  | "array-find-result"
  | "function-call"
  | "solid-show-binding"
  | "solid-show-when"
  | "solid-show-render-parameter"
  | "accessor-call"
  | "jsx-consumer-value"
  | "condition-consumer"
  | "render-consumer"
  | "handler-consumer"
  | "field-consumer-terminal"
  | "context-continuity"
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
  | "field-consumer"
  | "collection-element"
  | "predicate-result"
  | "call-result"
  | "return-expression"
  | "show-binding"
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
  | "http-bridge"
  | "carrier"
  | "collection-element"
  | "callback-parameter"
  | "predicate-return"
  | "find-result"
  | "function-return"
  | "function-call"
  | "show-when"
  | "show-render-parameter"
  | "accessor-call"
  | "consumer-value";
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
