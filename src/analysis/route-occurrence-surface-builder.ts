import path from "node:path";
import type * as TypeScript from "typescript";
import type { RouteRecord } from "./route-data";
import {
  declarationName,
  importModuleFor,
  inside,
  isDeclarationFile,
  locationForNode,
  relative,
  resolvedSymbol,
  sourceIdentityForNode,
  stableIdentity,
} from "./route-occurrence-support";
import {
  DEFAULT_ROUTE_OCCURRENCE_BUDGETS,
  RouteOccurrenceAccounting,
  positiveBudget,
  type RouteOccurrenceBudgetSet,
} from "./route-occurrence-surface-accounting";
import { RouteOccurrenceConditionEvaluator } from "./route-occurrence-condition-evaluation";
import {
  routeOccurrenceDeclarationIndex,
  type RouteOccurrenceDeclarationIndex,
} from "./route-occurrence-declaration-index";
import { asFunction, buildRouteEntry } from "./route-occurrence-surface-entry";
import { finishRouteOccurrenceSurface } from "./route-occurrence-surface-finalize";
import { attachOccurrenceToBoundary, attachOccurrenceToParent, type RouteBoundaryChildKind } from "./route-occurrence-surface-graph";
import { isTransparentWrapper } from "./route-occurrence-surface-policy";
import { scanOccurrenceDefinition } from "./route-occurrence-surface-scanner";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";
import type {
  HiddenWrapperCompatibilityOccurrence,
  RouteFrameworkBoundary,
  RouteFrameworkBoundaryKind,
  RouteOccurrenceDefinition,
  RouteOccurrenceEdge,
  RouteOccurrenceLocation,
  RouteOccurrenceOmissionReason,
  RouteOccurrenceRepetition,
  RouteOccurrenceSurface,
  RouteOccurrenceSurfaceOptions,
  RouteRenderOccurrence,
  RouteSlotForwarding,
  RouteTerminalOccurrence,
} from "./route-occurrence-surface";

export type RouteScanContext = {
  parentOccurrenceId: string | null;
  evaluationOccurrenceId: string | null;
  parentBoundaryId: string | null;
  boundaryChildKind: RouteBoundaryChildKind | null;
  repetition: RouteOccurrenceRepetition;
  markers: Array<"conditional" | "collection">;
  ownership: "scope-entry" | "caller-owned" | "definition-owned";
  declaration: TypeScript.FunctionLikeDeclaration | null;
};

export class RouteOccurrenceSurfaceBuilder {
  public readonly ts: typeof TypeScript;
  public readonly checker: TypeScript.TypeChecker;
  public readonly root: string;
  public readonly route: RouteRecord;
  public readonly scopeId: string;
  public readonly scopeSeed: string;
  public readonly includeIntrinsicTerminals: boolean;
  public readonly budgets: RouteOccurrenceBudgetSet;
  private readonly program: TypeScript.Program;
  private readonly files: TypeScript.SourceFile[];
  private readonly declarationIndex: RouteOccurrenceDeclarationIndex;
  private readonly conditionEvaluator: RouteOccurrenceConditionEvaluator;
  public readonly definitions = new Map<string, RouteOccurrenceDefinition>();
  public readonly occurrences = new Map<string, RouteRenderOccurrence>();
  public readonly boundaries = new Map<string, RouteFrameworkBoundary>();
  public readonly edges = new Map<string, RouteOccurrenceEdge>();
  public readonly slots = new Map<string, RouteSlotForwarding>();
  public readonly terminals = new Map<string, RouteTerminalOccurrence>();
  public readonly hiddenWrappers = new Map<string, HiddenWrapperCompatibilityOccurrence>();
  public readonly accounting: RouteOccurrenceAccounting;
  private readonly activeDefinitions = new Set<string>();
  private readonly cancellation: AnalysisCancellationToken;

  constructor(ts: typeof TypeScript, program: TypeScript.Program, root: string, route: RouteRecord, options: RouteOccurrenceSurfaceOptions) {
    this.ts = ts;
    this.program = program;
    this.root = root;
    this.route = route;
    this.cancellation = options.cancellation ?? NO_ANALYSIS_CANCELLATION;
    this.checker = program.getTypeChecker();
    this.files = program.getSourceFiles().filter((file) => !file.isDeclarationFile && inside(root, file.fileName));
    this.declarationIndex = routeOccurrenceDeclarationIndex(ts, program, root, this.files, this.cancellation);
    this.conditionEvaluator = new RouteOccurrenceConditionEvaluator(ts, this.checker);
    this.scopeId = options.scopeId ?? `route:${route.key}`;
    this.scopeSeed = options.scopeSeed ?? `${route.key}:${route.file}`;
    this.includeIntrinsicTerminals = options.includeIntrinsicTerminals ?? true;
    this.budgets = {
      definitions: positiveBudget(options.maxDefinitions, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.definitions),
      occurrences: positiveBudget(options.maxOccurrences, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.occurrences),
      boundaries: positiveBudget(options.maxBoundaries, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.boundaries),
      edges: positiveBudget(options.maxEdges, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.edges),
      terminals: positiveBudget(options.maxTerminals, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.terminals),
      omissions: positiveBudget(options.maxOmissions, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.omissions),
      depth: positiveBudget(options.maxDepth, DEFAULT_ROUTE_OCCURRENCE_BUDGETS.depth),
    };
    this.accounting = new RouteOccurrenceAccounting(root, this.scopeId, this.budgets);
  }

  build(): RouteOccurrenceSurface {
    this.checkCancellation();
    buildRouteEntry(this);
    this.checkCancellation();
    return finishRouteOccurrenceSurface(this);
  }

  public checkCancellation(): void {
    this.cancellation.throwIfCancelled();
  }

  public get surfaceId() {
    return stableIdentity("route-occurrence-surface", [this.route.key, this.scopeSeed, this.scopeId]);
  }

  public findSourceFile(file: string) {
    const absolute = path.normalize(path.resolve(this.root, file));
    return this.program.getSourceFile(absolute) ?? this.files.find((candidate) => relative(this.root, candidate.fileName) === file.replaceAll("\\", "/")) ?? null;
  }

  public definitionFor(resolved: ReturnType<typeof resolvedSymbol>, declaration: TypeScript.Node, fallbackName: string, importModule: string | null = null) {
    const compilerIdentity = resolved?.compilerIdentity ?? `route:${relative(this.root, declaration.getSourceFile().fileName)}:${declaration.getStart()}`;
    const sourceIdentity = sourceIdentityForNode(this.root, declaration);
    const id = stableIdentity("route-definition", [compilerIdentity, sourceIdentity]);
    const existing = this.definitions.get(id);
    if (existing) return existing;
    this.accounting.discover("definitions");
    if (!this.accounting.allow("definitions", this.definitions.size, declaration)) return null;
    const definition: RouteOccurrenceDefinition = {
      id,
      name: resolved?.symbol.getName() ?? declarationName(this.ts, declaration) ?? fallbackName,
      compilerIdentity,
      sourceIdentity,
      sourceFile: inside(this.root, declaration.getSourceFile().fileName) ? relative(this.root, declaration.getSourceFile().fileName) : null,
      importModule: importModule ?? (resolved ? importModuleFor(this.ts, this.checker, declaration) : null),
      declaration: locationForNode(this.root, declaration),
      external: !inside(this.root, declaration.getSourceFile().fileName) || isDeclarationFile(declaration),
    };
    this.definitions.set(id, definition);
    return definition;
  }

  public addOccurrence(
    definition: RouteOccurrenceDefinition,
    callSite: TypeScript.Node,
    context: RouteScanContext,
    expression = definition.name,
  ) {
    const callSiteIdentity = sourceIdentityForNode(this.root, callSite);
    const parent = context.parentOccurrenceId;
    const keyParts = [definition.sourceIdentity, callSiteIdentity, parent ?? "scope-root", this.scopeSeed, this.scopeId];
    const key = stableIdentity("route-occurrence-key", keyParts);
    const id = stableIdentity("route-occurrence", keyParts);
    const existing = this.occurrences.get(id);
    if (existing) {
      existing.repetition = mergeRepetition(existing.repetition, context.repetition);
      existing.repetitionMarkers = [...new Set([...existing.repetitionMarkers, ...context.markers])];
      return existing;
    }
    this.accounting.discover("occurrences");
    if (!this.accounting.allow("occurrences", this.occurrences.size, callSite)) return null;
    const occurrence: RouteRenderOccurrence = {
      id,
      key,
      callSiteId: stableIdentity("route-call-site", [callSiteIdentity, this.scopeId]),
      definitionId: definition.id,
      definitionSourceIdentity: definition.sourceIdentity,
      definitionCompilerIdentity: definition.compilerIdentity,
      name: definition.name,
      expression,
      parentOccurrenceId: parent,
      renderParentId: context.parentBoundaryId ?? parent,
      scopeId: this.scopeId,
      scopeSeed: this.scopeSeed,
      callSite: locationForNode(this.root, callSite),
      ownership: context.ownership,
      repetition: context.repetition,
      repetitionMarkers: [...new Set(context.markers)],
      runtimeMultiplicity: "unknown",
      staticCallSiteCount: 1,
      callerOwnedChildOccurrenceIds: [],
      definitionOwnedChildOccurrenceIds: [],
      slotForwardingIds: [],
      frameworkBoundaryIds: [],
      hiddenWrapperCompatibility: isTransparentWrapper(this, definition),
    };
    this.occurrences.set(id, occurrence);
    this.conditionEvaluator.register({
      occurrenceId: id,
      parentOccurrenceId: parent,
      callSite,
      declaration: asFunction(this.ts, this.renderDeclarationFor(definition)),
    });
    if (parent) attachOccurrenceToParent(this.occurrences.get(parent), id, context.ownership === "caller-owned");
    if (context.parentBoundaryId) attachOccurrenceToBoundary(this.boundaries.get(context.parentBoundaryId), id, context.boundaryChildKind ?? "content");
    if (occurrence.renderParentId) this.addEdge(occurrence.renderParentId, id, "render", [callSite], "The compiler-resolved JSX call site has one render parent.");
    if (occurrence.hiddenWrapperCompatibility) this.hiddenWrappers.set(id, { occurrenceId: id, definitionId: definition.id, name: definition.name, callSite: occurrence.callSite, detail: "Known layout wrapper retained as an occurrence for compatibility and local splice inspection." });
    return occurrence;
  }

  public expandOccurrence(occurrence: RouteRenderOccurrence, definition: RouteOccurrenceDefinition, depth: number) {
    this.checkCancellation();
    if (definition.external) {
      this.omit("external-code", `The ${definition.name} definition is outside the route source scope.`, occurrence.callSite);
      return;
    }
    if (depth >= this.budgets.depth) {
      this.omit("recursion-limit", `Render expansion stopped at depth ${this.budgets.depth} for ${definition.name}.`, occurrence.callSite);
      return;
    }
    if (this.activeDefinitions.has(definition.id)) {
      this.omit("recursion-limit", `Recursive render expansion stopped at ${definition.name}.`, occurrence.callSite);
      return;
    }
    const declaration = this.renderDeclarationFor(definition);
    if (!declaration) {
      this.omit("unresolved-symbol", `The ${definition.name} definition has no render declaration.`, occurrence.callSite);
      return;
    }
    this.activeDefinitions.add(definition.id);
    try {
      scanOccurrenceDefinition(this, occurrence, definition, declaration, depth);
    } finally {
      this.activeDefinitions.delete(definition.id);
    }
  }

  public renderDeclarationFor(definition: RouteOccurrenceDefinition) {
    return this.declarationIndex.get(definition.sourceIdentity) ?? null;
  }

  public evaluateCondition(occurrenceId: string | null, expression: TypeScript.Expression) {
    const result = this.conditionEvaluator.evaluate(occurrenceId, expression);
    return {
      outcome: result.outcome,
      detail: result.detail,
      locations: result.nodes.map((node) => locationForNode(this.root, node)),
    };
  }

  public addBoundary(name: string, kind: RouteFrameworkBoundaryKind, node: TypeScript.Node, context: RouteScanContext, marker: RouteOccurrenceRepetition, source: TypeScript.Expression | null, sourceBacked: boolean | null, condition: RouteFrameworkBoundary["condition"] = null) {
    const keyParts = [name, kind, sourceIdentityForNode(this.root, node), context.parentOccurrenceId ?? "scope-root", this.scopeSeed, this.scopeId];
    const id = stableIdentity("route-framework-boundary", keyParts);
    const existing = this.boundaries.get(id);
    if (existing) return existing;
    this.accounting.discover("boundaries");
    if (!this.accounting.allow("boundaries", this.boundaries.size, node)) return null;
    const boundary: RouteFrameworkBoundary = {
      id,
      key: stableIdentity("route-framework-boundary-key", keyParts),
      name,
      kind,
      scopeId: this.scopeId,
      scopeSeed: this.scopeSeed,
      parentOccurrenceId: context.parentOccurrenceId,
      renderParentId: context.parentBoundaryId ?? context.parentOccurrenceId,
      location: locationForNode(this.root, node),
      repetition: mergeRepetition(context.repetition, marker),
      repetitionMarkers: markersFor(context.markers, marker),
      runtimeMultiplicity: "unknown",
      childOccurrenceIds: [],
      fallbackChildOccurrenceIds: [],
      sourceExpression: source?.getText(source.getSourceFile()) ?? null,
      sourceLocation: source ? locationForNode(this.root, source) : null,
      sourceBacked,
      condition,
      ownership: "framework-owned",
    };
    this.boundaries.set(id, boundary);
    if (context.parentOccurrenceId) this.occurrences.get(context.parentOccurrenceId)?.frameworkBoundaryIds.push(id);
    if (boundary.renderParentId) this.addEdge(boundary.renderParentId, id, "framework-boundary", [node], "Framework ownership is explicit at this render boundary.");
    return boundary;
  }

  public addSlot(context: RouteScanContext, node: TypeScript.Node, slot: RouteSlotForwarding["evidence"]) {
    const slotOwnerId = context.evaluationOccurrenceId ?? context.parentOccurrenceId;
    const occurrence = slotOwnerId ? this.occurrences.get(slotOwnerId) : null;
    if (!occurrence) {
      this.omit("unsupported-ownership", "A slot expression has no owning component occurrence.", node);
      return;
    }
    const id = stableIdentity("route-slot-forwarding", [occurrence.id, sourceIdentityForNode(this.root, node), slot.kind]);
    if (this.slots.has(id)) return;
    const sourceBacked = Boolean(context.declaration && this.ts.isExpression(node));
    this.slots.set(id, { id, occurrenceId: occurrence.id, kind: slot.kind, evidence: slot, definitionSourceIdentity: occurrence.definitionSourceIdentity, sourceLocation: locationForNode(this.root, node), callerChildOccurrenceIds: [...occurrence.callerOwnedChildOccurrenceIds], sourceBacked, detail: `The component definition explicitly reads a caller-owned slot via ${slot.label} at this source location.` });
    occurrence.slotForwardingIds.push(id);
    for (const childId of occurrence.callerOwnedChildOccurrenceIds) {
      this.edges.delete(stableIdentity("route-occurrence-edge", [occurrence.id, childId, "render", this.scopeId]));
      if (context.parentBoundaryId) {
        attachOccurrenceToBoundary(this.boundaries.get(context.parentBoundaryId), childId, context.boundaryChildKind ?? "content");
        this.addEdge(context.parentBoundaryId, childId, "slot-forward", [node], "Caller-owned JSX is forwarded through an explicit boundary slot read.");
      } else {
        this.addEdge(occurrence.id, childId, "slot-forward", [node], "Caller-owned JSX is forwarded through an explicit slot read.");
      }
    }
  }

  public addTerminal(kind: RouteTerminalOccurrence["kind"], context: RouteScanContext, node: TypeScript.Node, label: string, expression: string | null) {
    this.accounting.discover("terminals");
    const id = stableIdentity("route-terminal", [kind, sourceIdentityForNode(this.root, node), context.parentOccurrenceId ?? "scope-root", this.scopeId]);
    if (this.terminals.has(id)) return;
    if (!this.accounting.allow("terminals", this.terminals.size, node)) return;
    this.terminals.set(id, { id, kind, ownerOccurrenceId: context.parentOccurrenceId, renderParentId: context.parentBoundaryId ?? context.parentOccurrenceId, location: locationForNode(this.root, node), label, expression, repetition: context.repetition, runtimeMultiplicity: "unknown" });
  }

  public addEdge(from: string, to: string, kind: RouteOccurrenceEdge["kind"], nodes: TypeScript.Node[], detail: string) {
    const id = stableIdentity("route-occurrence-edge", [from, to, kind, this.scopeId]);
    if (this.edges.has(id)) return;
    if (!this.accounting.allow("edges", this.edges.size, nodes[0] ?? null)) return;
    this.edges.set(id, { id, from, to, kind, locations: nodes.map((node) => locationForNode(this.root, node)), detail });
  }

  public omit(reason: RouteOccurrenceOmissionReason, label: string, node: TypeScript.Node | RouteOccurrenceLocation | null, count = 1) {
    this.accounting.omit(reason, label, node, count);
  }
}

function mergeRepetition(current: RouteOccurrenceRepetition, next: RouteOccurrenceRepetition): RouteOccurrenceRepetition {
  if (current === "unknown" || next === "unknown") return "unknown";
  if (current === "single") return next;
  if (next === "single" || current === next) return current;
  return "unknown";
}

function markersFor(current: Array<"conditional" | "collection">, marker: RouteOccurrenceRepetition) {
  const markers = new Set(current);
  if (marker === "conditional") markers.add("conditional");
  if (marker === "collection") markers.add("collection");
  return [...markers];
}
