import path from "node:path";
import { performance } from "node:perf_hooks";
import * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramElement,
  ProgramElementKind,
  ProgramEvidenceCollectionStats,
  ProgramEvidenceGap,
  ProgramEvidenceGapReason,
  ProgramEvidenceIndexes,
  ProgramEvidenceLocation,
  ProgramEvidenceOptions,
  ProgramEvidencePhaseName,
  ProgramOperationKind,
  ProgramProof,
  ProgramProofKind,
  ProgramRelation,
  ProgramRelationKind,
} from "./program-evidence";
import {
  compactLocation,
  expandLocation,
  type CompactProgramFact,
} from "./program-evidence-compact-facts";
import {
  connectProgramHttpBridges,
  hydrateProgramFact,
  hydratedFactsForIds,
  releaseProgramEvidenceTransientState,
} from "./program-evidence-hydration";
import type { RelationSink } from "./program-evidence-relation-loading";
import type {
  HttpBridgeFetch,
  HttpBridgeResource,
  HttpBridgeResponse,
} from "./http-bridge-evidence";
import {
  emptyProgramEvidenceCollectionStats,
  emptyProgramEvidenceDeclarationCatalogImportStats,
  readProgramEvidenceMemory,
} from "./program-evidence-collector-instrumentation";
import { importProgramEvidenceDeclarationCatalog } from "./program-evidence-collector-declaration-catalog";
import {
  createProgramEvidenceDeclarationCatalog,
  type DeclarationCatalogFunctionInfo,
  type DeclarationCatalogRelation,
  type ProgramEvidenceDeclarationCatalog,
  type ProgramEvidenceDeclarationCatalogView,
} from "./program-evidence-declaration-catalog";
import {
  calleeName,
  compilerSymbolId,
  firstBindingIdentifier,
  groupElements,
  groupRelations,
  importModule,
  inside,
  isEffectName,
  isFrameworkCall,
  locationFor,
  relative,
  proof,
  stableId,
  stableSerialize,
} from "./program-evidence-support";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "./cancellation";

export type CollectorFunctionInfo = DeclarationCatalogFunctionInfo;

export type CollectorCallInfo = {
  node: TypeScript.CallExpression | TypeScript.NewExpression;
  id: string;
  target: CollectorFunctionInfo | null;
  ownerId: string | null;
};

export type CollectorReferenceInfo = {
  node: TypeScript.Identifier;
  id: string;
  symbolId: string | null;
};

export class ProgramEvidenceCollectorSupport {
  protected readonly checker: TypeScript.TypeChecker;
  protected readonly root: string;
  protected readonly files: TypeScript.SourceFile[];
  protected readonly facts: CompactProgramFact[] = [];
  protected readonly relations: ProgramRelation[] = [];
  protected readonly gaps: ProgramEvidenceGap[] = [];
  protected readonly elementKeys = new Map<string, string>();
  protected readonly elementIdsByNodeKind = new Map<string, string>();
  protected readonly relationIds = new Set<string>();
  protected readonly gapIds = new Set<string>();
  protected readonly filesByRelativeName = new Map<string, TypeScript.SourceFile>();
  protected readonly symbolIds = new WeakMap<TypeScript.Node, string | null>();
  protected readonly moduleNames = new WeakMap<TypeScript.Node, string | null>();
  protected readonly functionsByNode = new Map<string, CollectorFunctionInfo>();
  protected readonly functionsBySymbol = new Map<string, CollectorFunctionInfo>();
  protected readonly functionsById = new Map<string, CollectorFunctionInfo>();
  protected readonly parametersBySymbol = new Map<string, string>();
  protected readonly variablesBySymbol = new Map<string, string>();
  protected readonly resourceBySymbol = new Map<string, string>();
  protected readonly returnsByFunction = new Map<string, string[]>();
  protected readonly calls: CollectorCallInfo[] = [];
  protected readonly references: CollectorReferenceInfo[] = [];
  protected readonly httpFetches: HttpBridgeFetch[] = [];
  protected readonly httpResources: HttpBridgeResource[] = [];
  protected readonly httpResponses: HttpBridgeResponse[] = [];
  protected readonly declarationRelationDescriptors: DeclarationCatalogRelation[] = [];
  protected readonly declarationAstUnitsByFile = new Map<string, number>();
  protected relationSink: RelationSink | null;
  protected relationsDiscarded = false;
  protected sourceFactsCollected = false;
  protected declarationFactEnd = 0;
  protected declarationRelationCaptureEnabled = false;
  protected readonly declarationCatalog: ProgramEvidenceDeclarationCatalogView | null;
  protected readonly cancellation: AnalysisCancellationToken;
  protected declarationCatalogImportStats = emptyProgramEvidenceDeclarationCatalogImportStats();
  protected readonly collectionProfilingEnabled = process.env.TSX_DATA_FLOW_COLLECTOR_PROFILE === "1";
  protected collectionStats: ProgramEvidenceCollectionStats = emptyProgramEvidenceCollectionStats(0);
  private profileProgressMessages = 0;

  constructor(
    protected readonly ts: typeof TypeScript,
    program: TypeScript.Program,
    root: string,
    options: ProgramEvidenceOptions,
    relationSink: RelationSink | null = null,
  ) {
    this.checker = program.getTypeChecker();
    this.root = path.resolve(root);
    this.relationSink = relationSink;
    this.cancellation = options.cancellation ?? NO_ANALYSIS_CANCELLATION;
    const candidates = options.sourceFiles ?? program.getSourceFiles();
    this.files = [...candidates]
      .filter(
        (file) =>
          (options.includeDeclarationFiles || !file.isDeclarationFile) &&
          inside(this.root, file.fileName),
      )
      .sort((left, right) =>
        relative(this.root, left.fileName).localeCompare(
          relative(this.root, right.fileName),
        ),
      );
    for (const file of this.files) {
      this.filesByRelativeName.set(relative(this.root, file.fileName), file);
    }
    const selectedNames = new Set(this.files.map((file) => relative(this.root, file.fileName)));
    this.declarationCatalog = options.declarationCatalog?.forFiles(selectedNames) ?? null;
    if (this.declarationCatalog) {
      const imported = importProgramEvidenceDeclarationCatalog(
        {
          facts: this.facts,
          functionsByNode: this.functionsByNode,
          functionsBySymbol: this.functionsBySymbol,
          functionsById: this.functionsById,
          parametersBySymbol: this.parametersBySymbol,
          variablesBySymbol: this.variablesBySymbol,
          resourceBySymbol: this.resourceBySymbol,
          returnsByFunction: this.returnsByFunction,
          elementIdsByNodeKind: this.elementIdsByNodeKind,
        },
        this.declarationCatalog,
        this.collectionProfilingEnabled,
      );
      this.declarationFactEnd = imported.declarationFactEnd;
      this.declarationCatalogImportStats = imported.stats;
    }
  }

  public getCollectionStats(): ProgramEvidenceCollectionStats {
    return { ...this.collectionStats };
  }

  public createDeclarationCatalog(): ProgramEvidenceDeclarationCatalog {
    if (!this.sourceFactsCollected) {
      throw new Error("The declaration catalog requires a completed source-fact collection.");
    }
    return createProgramEvidenceDeclarationCatalog({
      root: this.root,
      sourceFiles: this.files.map((file) => relative(this.root, file.fileName)),
      allFacts: this.facts,
      declarationFacts: this.facts.slice(0, this.declarationFactEnd),
      declarationRelations: this.declarationRelationDescriptors,
      functionsByNode: this.functionsByNode,
      functionsBySymbol: this.functionsBySymbol,
      functionsById: this.functionsById,
      parametersBySymbol: this.parametersBySymbol,
      variablesBySymbol: this.variablesBySymbol,
      resourceBySymbol: this.resourceBySymbol,
      returnsByFunction: this.returnsByFunction,
      elementIdsByNodeKind: this.elementIdsByNodeKind,
      declarationAstUnitsByFile: this.declarationAstUnitsByFile,
    });
  }

  protected resetCollectionStats(sourceFilesVisited: number): void {
    this.collectionStats = emptyProgramEvidenceCollectionStats(sourceFilesVisited);
    this.collectionStats.declarationCatalog = this.declarationCatalogImportStats;
  }

  protected checkCancellation(): void { this.cancellation.throwIfCancelled(); }
  protected noteAstUnit(): void { if (this.collectionProfilingEnabled) this.collectionStats.astUnitsVisited += 1; this.checkCancellation(); }

  protected replayDeclarationRelations(): void {
    if (!this.declarationCatalog) return;
    for (const relation of this.declarationCatalog.declarationRelations) {
      this.checkCancellation();
      const evidence = relation.evidence.map(expandLocation);
      const input = {
        id: relation.id,
        from: relation.from,
        to: relation.to,
        kind: relation.kind as ProgramRelationKind,
        evidence,
        proof: {
          kind: relation.proofKind,
          detail: relation.proofDetail,
          locations: relation.proofLocations.map(expandLocation),
        },
        confidence: relation.confidence,
      };
      if (this.relationSink) {
        this.relationSink(input);
      } else if (!this.relationsDiscarded && !this.relationIds.has(input.id)) {
        this.relationIds.add(input.id);
        this.relations.push(input);
      }
    }
  }

  protected measurePhase<T>(
    name: ProgramEvidencePhaseName,
    inputCount: number,
    operation: () => T,
    outputCount?: () => number,
  ): T {
    if (!this.relationSink || !this.collectionProfilingEnabled) return operation();
    const phase = this.collectionStats.phases[name];
    const relationCountBefore = this.collectionStats.relation.candidateCalls;
    const started = performance.now();
    const memoryStart = readProgramEvidenceMemory();
    try {
      return operation();
    } finally {
      const memoryEnd = readProgramEvidenceMemory();
      phase.calls += 1;
      phase.elapsedMs += performance.now() - started;
      phase.inputCount += inputCount;
      phase.outputCount += outputCount?.() ?? this.collectionStats.relation.candidateCalls - relationCountBefore;
      if (!phase.memoryStart && memoryStart) phase.memoryStart = memoryStart;
      if (memoryEnd) phase.memoryEnd = memoryEnd;
    }
  }

  protected reportCollectorProgress(phase: "declarations" | "nodes", file: TypeScript.SourceFile): void {
    if (!this.relationSink || !this.collectionProfilingEnabled || this.profileProgressMessages >= 128) return;
    this.profileProgressMessages += 1;
    const memory = readProgramEvidenceMemory();
    process.stderr.write(`[collector-progress] ${JSON.stringify({
      phase,
      file: relative(this.root, file.fileName),
      sourceFilesVisited: this.collectionStats.sourceFilesVisited,
      astUnitsVisited: this.collectionStats.astUnitsVisited,
      facts: this.facts.length,
      relationCandidates: this.collectionStats.relation.candidateCalls,
      memory,
    })}\n`);
  }

  public get sourceFiles(): readonly TypeScript.SourceFile[] {
    return this.files;
  }

  public releaseTransientState(): void {
    releaseProgramEvidenceTransientState({
      maps: [
        this.elementKeys,
        this.elementIdsByNodeKind,
        this.functionsByNode,
        this.functionsBySymbol,
        this.functionsById,
        this.parametersBySymbol,
        this.variablesBySymbol,
        this.resourceBySymbol,
        this.returnsByFunction,
      ],
      lists: [
        this.calls,
        this.references,
        this.httpFetches,
        this.httpResources,
        this.httpResponses,
      ],
    });
  }

  public hydrateFact(fact: CompactProgramFact): ProgramElement {
    return hydrateProgramFact(
      {
        ts: this.ts,
        checker: this.checker,
        filesByRelativeName: this.filesByRelativeName,
      },
      fact,
    );
  }

  protected specialInput(
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Record<string, string | number | boolean | null>,
    proofKind: ProgramProofKind,
    detail: string,
    operationKind: ProgramOperationKind | null = null,
  ): string {
    return this.ensureElement(
      node,
      kind,
      ownerId,
      attributes,
      this.symbolId(node),
      this.moduleFor(node),
      null,
      "proven",
      proof(proofKind, detail, [this.location(node)]),
      operationKind,
    );
  }

  protected connectHttpBridges(): void {
    connectProgramHttpBridges({
      checkCancellation: () => this.checkCancellation(),
      ts: this.ts,
      checker: this.checker,
      elements: this.elementsForHttpBridges(),
      fetches: this.httpFetches,
      calls: this.calls,
      resources: this.httpResources,
      responses: this.httpResponses,
      requestParameterIds: this.parametersBySymbol,
      symbolId: (node) => this.symbolId(node),
      location: (node) => this.location(node),
      addRelation: (...args) => this.addRelation(...args),
      reconcileGap: (fetchId) => this.reconcileHttpBridgeGap(fetchId),
    });
  }

  protected reconcileHttpBridgeGap(fetchId: string): void {
    for (let index = this.gaps.length - 1; index >= 0; index -= 1) {
      const gap = this.gaps[index];
      if (
        gap.from === fetchId &&
        gap.reason === "external-code" &&
        gap.detail.startsWith("Static proof stops at the external response body;")
      ) {
        this.gaps.splice(index, 1);
      }
    }
  }

  protected elementFor(node: TypeScript.Node, kind: ProgramElementKind): string {
    const location = this.location(node);
    const id = this.elementIdsByNodeKind.get(`${locationKey(location)}:${kind}`);
    if (!id) {
      throw new Error(
        `Program evidence element was not collected: ${locationKey(location)}:${kind}`,
      );
    }
    return id;
  }

  protected ensureElement(
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Record<string, string | number | boolean | null>,
    symbolId: string | null,
    module: string | null,
    definitionId: string | null,
    confidence: EvidenceConfidence,
    proofValue: ProgramProof,
    operationKind: ProgramOperationKind | null = null,
  ): string {
    const location = this.location(node);
    const key = `${locationKey(location)}:${kind}:${operationKind ?? ""}:${symbolId ?? ""}:${stableSerialize(attributes)}`;
    const existing = this.elementKeys.get(key);
    if (existing) return existing;
    const expression = node.getText(node.getSourceFile()).replace(/\s+/g, " ").trim();
    const id = stableId("program-element", [
      location.file,
      location.span,
      kind,
      operationKind,
      expression,
      symbolId,
      module,
      definitionId,
      ownerId,
      attributes,
    ]);
    this.elementKeys.set(key, id);
    this.elementIdsByNodeKind.set(`${locationKey(location)}:${kind}`, id);
    this.facts.push({
      id,
      kind,
      operationKind,
      label:
        attributes.name?.toString() ??
        attributes.property?.toString() ??
        attributes.tag?.toString() ??
        expression.slice(0, 240),
      location: compactLocation(location),
      nodeStart: node.getStart(node.getSourceFile()),
      nodeEnd: node.getEnd(),
      nodeKind: node.kind,
      symbolId,
      module,
      definitionId,
      ownerId,
      attributes: { ...attributes },
      confidence,
      proofKind: proofValue.kind,
      proofDetail: proofValue.detail,
    });
    if (ownerId) {
      this.addRelation(
        ownerId,
        id,
        "contains",
        [location],
        proof(
          "ast-node",
          "The containing function owns this source occurrence.",
          [location],
        ),
        "proven",
      );
    }
    return id;
  }

  protected addRelation(
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ProgramProof,
    confidence: EvidenceConfidence,
  ): void {
    this.checkCancellation(); const instrumented = this.relationSink !== null && this.collectionProfilingEnabled;
    if (instrumented) this.collectionStats.relation.candidateCalls += 1;
    if (this.relationsDiscarded) {
      if (this.declarationRelationCaptureEnabled && from && to && from !== to) {
        const id = stableId("program-relation", [from, to, kind, locations, proofValue.kind, proofValue.detail]);
        this.declarationRelationDescriptors.push({
          id,
          from,
          to,
          kind,
          evidence: locations.map(compactLocation),
          proofKind: proofValue.kind,
          proofDetail: proofValue.detail,
          proofLocations: proofValue.locations.map(compactLocation),
          confidence,
        });
      }
      return;
    }
    if (!from || !to || from === to) return;
    if (instrumented) {
      this.collectionStats.relation.acceptedCandidates += 1;
      this.collectionStats.relation.proofCount += 1;
      this.collectionStats.relation.proofLocationCount += proofValue.locations.length;
    }
    const stableIdStarted = instrumented ? performance.now() : 0;
    const id = stableId("program-relation", [
      from,
      to,
      kind,
      locations,
      proofValue.kind,
      proofValue.detail,
    ]);
    if (instrumented) {
      this.collectionStats.relation.relationIdCalls += 1;
      this.collectionStats.relation.relationIdElapsedMs += performance.now() - stableIdStarted;
    }
    if (this.relationSink) {
      const sinkStarted = instrumented ? performance.now() : 0;
      this.relationSink({
        id,
        from,
        to,
        kind,
        evidence: locations,
        proof: proofValue,
        confidence,
      });
      if (instrumented) {
        this.collectionStats.relation.sinkCalls += 1;
        this.collectionStats.relation.sinkElapsedMs += performance.now() - sinkStarted;
        this.collectionStats.relation.retainedRecipes += 1;
      }
      return;
    }
    if (this.relationIds.has(id)) return;
    this.relationIds.add(id);
    this.relations.push({
      id,
      from,
      to,
      kind,
      evidence: locations,
      proof: proofValue,
      confidence,
    });
  }

  protected gap(
    from: string,
    direction: "forward" | "backward",
    reason: ProgramEvidenceGapReason,
    detail: string,
    node: TypeScript.Node,
  ): void {
    const location = this.location(node);
    const id = stableId("program-gap", [from, direction, reason, detail, location]);
    if (this.gapIds.has(id)) return;
    this.gapIds.add(id);
    this.gaps.push({ id, from, to: null, direction, reason, detail, location });
  }

  protected targetFunction(node: TypeScript.Node): CollectorFunctionInfo | null {
    const symbolId = this.symbolId(node);
    return symbolId ? this.functionsBySymbol.get(symbolId) ?? null : null;
  }

  protected isExternalCall(node: TypeScript.CallExpression): boolean {
    if (this.targetFunction(node.expression)) return false;
    const module = this.moduleFor(node.expression);
    return Boolean(
      (module && !isFrameworkCall(module, calleeName(this.ts, node.expression))) ||
        isEffectName(calleeName(this.ts, node.expression)),
    );
  }

  protected variableId(node: TypeScript.VariableDeclaration): string | null {
    const binding = firstBindingIdentifier(this.ts, node.name);
    return binding
      ? this.variablesBySymbol.get(this.symbolId(binding) ?? "") ?? null
      : null;
  }

  protected symbolId(node: TypeScript.Node): string | null {
    if (this.symbolIds.has(node)) return this.symbolIds.get(node) ?? null;
    const value = compilerSymbolId(this.ts, this.checker, this.root, node);
    this.symbolIds.set(node, value);
    return value;
  }

  protected moduleFor(node: TypeScript.Node): string | null {
    if (this.moduleNames.has(node)) return this.moduleNames.get(node) ?? null;
    const value = importModule(this.ts, this.checker, node);
    this.moduleNames.set(node, value);
    return value;
  }

  protected location(node: TypeScript.Node): ProgramEvidenceLocation {
    if (!this.relationSink || !this.collectionProfilingEnabled) return locationFor(this.root, node.getSourceFile(), node);
    const started = performance.now();
    const location = locationFor(this.root, node.getSourceFile(), node);
    this.collectionStats.relation.locationCalls += 1;
    this.collectionStats.relation.locationElapsedMs += performance.now() - started;
    return location;
  }

  private elementsForHttpBridges(): ProgramElement[] {
    const ids = new Set<string>();
    for (const call of this.calls) {
      if (call.target) ids.add(call.target.id);
    }
    for (const parameterId of this.parametersBySymbol.values()) {
      ids.add(parameterId);
    }
    return hydratedFactsForIds(this.facts, ids, (fact) => this.hydrateFact(fact));
  }

  protected buildIndexes(elements: ProgramElement[]): ProgramEvidenceIndexes {
    const elementsById = new Map(elements.map((element) => [element.id, element]));
    const relationsById = new Map(
      this.relations.map((relation) => [relation.id, relation]),
    );
    const outgoingRelationIds = groupRelations(
      this.relations,
      (relation) => relation.from,
    );
    const incomingRelationIds = groupRelations(
      this.relations,
      (relation) => relation.to,
    );
    const operationElements = elements.filter((element) => element.operationKind);
    return {
      elementsById,
      relationsById,
      outgoingRelationIds,
      incomingRelationIds,
      elementIdsByKind: groupElements(elements, (element) => element.kind),
      elementIdsByFile: groupElements(elements, (element) => element.location.file),
      elementIdsBySymbolId: groupElements(
        elements,
        (element) => element.symbolId ?? "",
      ),
      relationIdsByKind: groupRelations(
        this.relations,
        (relation) => relation.kind,
      ),
      operationIdsByKind: groupElements(
        operationElements,
        (element) => element.operationKind as ProgramOperationKind,
      ),
    };
  }
}

function locationKey(location: ProgramEvidenceLocation): string {
  return `${location.file}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`;
}
