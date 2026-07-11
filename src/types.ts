import type * as TypeScript from "typescript";
import type { buildReport } from "./analysis/report-builder.js";
export interface SourceLocation { line: number; column: number; file?: string }
export interface SourceSpan { startLine: number; startColumn: number; endLine: number; endColumn: number }

export interface AnalyzerArgs {
  root: string;
  source: string;
  tsconfig: string | null;
  tsconfigs?: string[];
  tsconfigWarnings?: string[];
  tsconfigExplicit?: boolean;
  typescriptFrom?: string | null;
  format: "json" | "markdown";
  view: string;
  scope: string | null;
  file: string[];
  out: string | null;
  baseline: string | null;
  compare: string | null;
  maxItems: number;
  maxItemsExplicit?: boolean;
  sort: string;
  diversity: number | null;
  perFile: number | null;
  perFeature: number | null;
  units: boolean;
  by: string;
  includeTests: boolean;
  failOnRegression: boolean;
  traceHelpers: boolean;
  maxHelperDepth: number;
  help?: boolean;
  regenAll?: boolean;
}

export interface GraphNode {
  id: string;
  kind: string;
  label: string;
  file?: string;
  location?: SourceLocation | null;
  type?: string;
}
export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  unknown: boolean;
  location: SourceLocation | null;
}
export interface AnalysisGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nextNodeId: number;
  nextEdgeId: number;
  root: string;
}
export interface ReportGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unknownEdges: number;
}
export interface ProgramRouting {
  byFile: Map<string, { configFile: string; program: TypeScript.Program; checker: TypeScript.TypeChecker }>;
  programs: TypeScript.Program[];
}

export interface RootInfo { label: string; kind: string; def?: { file: string; line: number } }
export interface TraceStep { label: string; kind: string; detail: string | null; file: string | null; line: number | null }
export interface DefenseRecord {
  key?: string;
  expression: string;
  location: SourceLocation;
  verdict: string;
  origin: string;
  type?: string;
  guarded?: string;
  guardedExpression?: string;
  [key: string]: unknown;
}
export interface RepresentationStep { key: string; kind: string; label: string; file: string; line: number }
export interface TraceResult {
  lastNodeId: string;
  roots: string[];
  rootInfos: RootInfo[];
  edges: string[];
  defenses: DefenseRecord[];
  representationSteps: RepresentationStep[];
  longestPath: TraceStep[];
  packs: Array<{ key: string; label: string }>;
  unknown?: boolean;
  headText: string;
}

export interface CatalogFunction {
  symbol: TypeScript.Symbol; name: string; file: string; line: number;
  params: Array<{ name: string; type: string }>;
  arity: number; callerCount: number; callers: Array<{ file: string; line: number; snippet: SourceSnippet | null }>;
  fnNode: TypeScript.FunctionLikeDeclaration;
  returnExpr: TypeScript.Expression | null;
  sourceFile: TypeScript.SourceFile;
  checker?: TypeScript.TypeChecker;
  [key: string]: unknown;
}
export interface FileTraceContext {
  variables: Map<string, TypeScript.VariableDeclaration>;
  functions: Map<string, TypeScript.FunctionLikeDeclaration>;
  accessors: Map<string, AccessorRecord>;
  parameters: Set<string>;
  imports: Set<string>;
}
export interface AccessorRecord {
  kind: "memo" | "signal" | "resource";
  declaration: TypeScript.VariableDeclaration;
}
export interface CrossFileState {
  args: AnalyzerArgs;
  contextCache: Map<TypeScript.SourceFile, FileTraceContext>;
  catalog: Map<TypeScript.Symbol, CatalogFunction | null>;
  reached: Set<TypeScript.Symbol>;
  budget: number;
}
export interface TraceContext extends FileTraceContext {
  sourceFile: TypeScript.SourceFile;
  root: string;
  stack: Set<TypeScript.Node>;
  crossFile: CrossFileState | null;
  crossDepth: number;
  visitedFns: Set<TypeScript.Symbol>;
  paramBindings: Map<string, TraceResult> | null;
}
export type TraceExpressionFn = (
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  graph: AnalysisGraph,
  expression: TypeScript.Expression,
  context: TraceContext,
) => TraceResult;

export interface SinkMetrics {
  sliceSize: number; maximumPathDepth: number; helperHops: number;
  representationChurn: number; defensiveOperationCount: number;
  actionableDefensiveOperationCount: number; certaintyBoundaryDefenseCount: number;
  impossibleDefenseCount: number; controlDependencyCount: number; mergeWidth: number;
  reachableSinks: number; repeatedNormalization: number; unknownEdgeCount: number;
  packFamilyDiversity: number; packRisk: number; suspiciousPackCount: number;
}
export interface Sink {
  id: string; file: string; line: number; column: number; span: SourceSpan;
  category: string; label: string; expression: string; type: string; nodeId: string;
  renderContext: { tag: string | null; attribute: string | null; component: string | null };
  roots: string[]; rootInfos: RootInfo[]; representativePath: string[];
  representativeSteps: TraceStep[]; representationSteps: RepresentationStep[];
  packs: Array<{ key: string; label: string }>; metrics: SinkMetrics;
  defenses: DefenseRecord[]; confidence: number; confidenceReason: string;
  confidenceRisk: string; queue: string;
  scores?: SinkScores;
  advice?: { primaryShape?: string; shape?: string; firstCut?: string; headline?: string; [key: string]: unknown };
  family?: string; tier?: string; packVerdicts?: string[];
  reachedVia?: Array<{ source: string; total?: number; sinks: ReachedSink[] }>;
  background?: { label: string; reason: string; penalty: number } | null;
  unit?: WorkUnitDetails;
  [key: string]: unknown;
}
export interface SinkScores {
    burden: number; rawBurden?: number; centralLeverage?: number; centrality?: number;
    investigationPriority?: number; quickWin?: number;
    burdenBreakdown?: { backgroundPenalty: number; rawSum: number; total: number; terms: BurdenTerm[] };
}
export interface BurdenTerm {
  key: string; label: string; weight: number; raw: number;
  normalized: number; contribution: number;
}
export interface RankedSink extends Sink {
  scores: SinkScores;
  tier: string;
}
export interface WorkUnitDetails {
    sinkCount: number;
    members: Array<{ id: string; line: number; label: string }>;
    pivots: string[]; causes: string[]; shape: string;
}
export interface WorkUnit extends RankedSink {
  unit: WorkUnitDetails;
}
export interface PackEvidence {
  familyCount: number; sourceRootCount: number; sourceFamilyCount: number;
  defensiveOps: number; representationChurn: number; helperHops: number; maxReach: number;
  parserBoundary: boolean; helperBoundary: boolean; mirrorLike: boolean; relayLike: boolean;
}
export interface PackGroup {
  key: string; label: string; sinkCount: number; families: string[];
  familyMembers: Record<string, string[]>; evidence: PackEvidence; verdict: string;
}
export interface SourceSnippet {
  startLine: number; endLine: number; hitLine: number | null;
  truncated: boolean; lines: string[];
}
export interface BoundaryHelper {
  name: string; file: string; line: number; params: Array<{ name: string; type: string }>;
  arity: number; returnType: string; inRoots: string[]; inSources: number;
  callerCount: number; callers: Array<{ file: string; line: number; snippet: SourceSnippet | null }>;
  inlineBodySnippet: SourceSnippet | null; passThrough: boolean; typeLeak: boolean;
  internalDepth: number; internalChurn: number; internalDefenses: number;
  internalImpossible: number; verdict: string; debt: number;
}
export interface UnknownEdgeRow {
  id: string; file: string; line: number | null; kind: string; label: string;
  source: Pick<GraphNode, "id" | "kind" | "label"> | null;
  target: Pick<GraphNode, "id" | "kind" | "label"> | null;
  affectedSinks: ReachedSink[];
  occurrences: number;
}
export interface ReachedSink {
  id: string; file: string; line: number; label: string; depth: number;
}

export type AnalysisReport = ReturnType<
  typeof buildReport
>;
