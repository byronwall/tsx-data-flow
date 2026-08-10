import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink, SourceSpan } from "../types";
import { collectReachableFiles, discoverRoute, stableHash } from "./route-discovery";
import { resourceBoundaryIdentity } from "./route-data-resource";
import { collectCalledDeclarations } from "./route-data-consumers";
import { collectResourceHttpBridges, type RouteDataHttpBridge } from "./route-data-http";
import { buildRouteShadowEvidence, type RouteShadowEvidence } from "./route-shadow-evidence";
import { createLazyProgramEvidenceProvider } from "./evidence-relation-provider";
import { discoverSolidRouteCandidates } from "./scope-adapters/solid-route";
import { createRouteDataTotalitySession, registerRouteDataTotalitySession } from "./route-data-session";
import type { RouteTotalityRecord } from "./route-data-totality";
import {
  buildLegacyTerminals,
  chooseLegacyCandidates,
  collectLegacyCandidates,
  evidenceForLegacyCandidate,
  legacyEffectSummary,
  legacyOperationOwner,
  legacyValueLabel,
  shapeForLegacyCandidate,
} from "./route-data-legacy-support";

export type RouteEvidenceConfidence = "high" | "medium" | "low";
export type RouteDataEffect = "preserve" | "project" | "augment" | "derive" | "select" | "group" | "normalize" | "opaque" | "render";

export interface RouteComponentRecord {
  id: string;
  label: string;
  file: string;
  line: number;
  parentId: string | null;
  role: "route" | "component" | "framework";
}

export interface RouteRecord {
  key: string;
  pathPattern: string;
  file: string;
  componentIdentityId: string | null;
  parameters: Array<{ name: string; kind: "dynamic" | "catch-all" }>;
  confidence: RouteEvidenceConfidence;
  evidence: RouteDataEvidence | null;
  componentNames: string[];
  componentHierarchy: RouteComponentRecord[];
  renderedComponents?: RouteComponentRecord[];
  renderedComponentEdges?: Array<{ from: string; to: string }>;
  sinkIds: string[];
  omissions: string[];
}

export interface RouteDataField { key: string; typeText: string; optional: boolean }
export interface ValueShapeSummary {
  id: string;
  typeName: string | null;
  typeText: string;
  kind: "primitive" | "object" | "collection" | "union" | "opaque";
  fields: RouteDataField[];
  totalFields: number;
  opacityReason: string | null;
}
export interface RouteDataValue { id: string; label: string; shapeId: string; sourceOperationKey: string | null }
export interface RouteDataFieldEffect { kind: RouteDataEffect; field: string | null; detail: string }
export interface RouteDataEvidence {
  id: string;
  expression: string;
  operationKind: string;
  file: string;
  line: number;
  column: number;
  span: SourceSpan;
  inputType: string;
  outputType: string;
  compilerIdentity: string | null;
  confidence: RouteEvidenceConfidence;
  unknownReason: string | null;
  /** Internal exact link from route evidence to one compiler-backed program element. */
  programElementId?: string | null;
}
export interface RouteDataBoundary { kind: "query" | "resource" | "component" | "prop" | "context" | "call"; label: string }
export interface RouteDataOperationOwner { label: string; file: string; line: number }
export interface DataOperation {
  key: string;
  semanticKind: "read" | "parse" | "validate" | "map" | "project" | "augment" | "derive" | "select" | "group" | "normalize" | "boundary" | "render" | "opaque";
  effect: RouteDataEffect;
  label: string;
  inputValueIds: string[];
  outputValueIds: string[];
  inputShapeIds: string[];
  outputShapeIds: string[];
  fieldEffects: RouteDataFieldEffect[];
  sourceExpressionIds: string[];
  boundary: RouteDataBoundary | null;
  boundaryId: string | null;
  transportBridge: RouteDataHttpBridge | null;
  consumerHandoff: { kind: "return"; outputShapeId: string; fieldPaths: string[] } | null;
  owner: RouteDataOperationOwner | null;
  confidence: RouteEvidenceConfidence;
  completeness: "complete" | "partial" | "opaque";
  completenessReason: string;
}
export interface RouteDataTerminal { id: string; label: string; file: string; line: number; component: string | null; operationKey: string }
export interface RouteDataTrajectory {
  key: string;
  routeKey: string;
  label: string;
  sourceValueIds: string[];
  operationKeys: string[];
  terminalIds: string[];
  supportingComponentIds: string[];
  routeReachableTerminalCount: number;
  terminalSelectionLimit: number;
  ordering: "semantic-stage";
  handoffsProven: boolean;
  completeness: "complete-for-supported-scope" | "partial" | "unknown";
  omissions: string[];
}
export interface RouteDataAnalysis {
  routes: RouteRecord[];
  trajectories: RouteDataTrajectory[];
  operations: DataOperation[];
  values: RouteDataValue[];
  shapes: ValueShapeSummary[];
  evidence: RouteDataEvidence[];
  terminals: RouteDataTerminal[];
  routeTotality: RouteTotalityRecord[];
  shadowEvidence: RouteShadowEvidence | null;
}

export function analyzeRouteData(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  sinks: Sink[],
  findings: readonly Sink[] = sinks,
): RouteDataAnalysis {
  const checker = program.getTypeChecker();
  const files = program.getSourceFiles().filter((file) => !file.isDeclarationFile && inside(root, file.fileName));
  const filesByName = new Map(files.map((file) => [path.normalize(file.fileName), file]));
  const routes = files.map((file) => discoverRoute(ts, checker, root, file)).filter((route): route is RouteRecord => Boolean(route));
  const provider = createLazyProgramEvidenceProvider(ts, program, root);
  const solidRouteCandidates = discoverSolidRouteCandidates(root, {
    elements: provider.facts.elements,
    relations: [],
  });
  const operations: DataOperation[] = [];
  const values: RouteDataValue[] = [];
  const shapes: ValueShapeSummary[] = [];
  const evidence: RouteDataEvidence[] = [];
  const terminals: RouteDataTerminal[] = [];
  const trajectories: RouteDataTrajectory[] = [];

  for (const route of routes) {
    const routeFile = filesByName.get(path.normalize(path.resolve(root, route.file)));
    if (!routeFile) continue;
    const reachable = collectReachableFiles(ts, root, routeFile, filesByName);
    const renderedComponents = collectRenderedComponents(ts, checker, root, routeFile, route);
    route.renderedComponents = renderedComponents.records;
    route.renderedComponentEdges = renderedComponents.edges;
    const called = collectCalledDeclarations(ts, checker, program, root, routeFile, renderedComponents.records);
    const httpBridges = collectResourceHttpBridges(ts, checker, program, root, reachable, routes, filesByName);
    const candidates = collectLegacyCandidates(
      ts,
      checker,
      program,
      root,
      reachable,
      called.declarations,
      called.resourceOutputs,
      called.consumerFields,
      httpBridges,
    );
    const routeSinks = sinks.filter((sink) => sinkBelongsToRenderedComponent(sink, route, renderedComponents.keys));
    // Finding IDs are intentionally human-readable line/column labels and can
    // repeat across files. Route membership must use the file-qualified key or
    // unrelated sinks at the same coordinates contaminate the route graph.
    route.sinkIds = routeSinks.map((sink) => routeSinkKey(sink));
    const selected = chooseLegacyCandidates(ts, candidates, routeSinks, root, route, filesByName);
    const routeOperationKeys: string[] = [];
    const routeValueIds: string[] = [];

    const candidateGroups = selected.map((candidate) => [candidate]);
    for (const group of candidateGroups) {
      const candidate = group[0];
      const sources = group.map((item) => {
        const evidenceValue = evidenceForLegacyCandidate(ts, checker, root, item);
        return {
          ...evidenceValue,
          programElementId: exactFileInputElementId(provider, item.node, evidenceValue.file, item.kind),
        };
      });
      const source = sources[0];
      const shapeNode = candidate.shapeNode ?? candidate.node;
      const outputType = safeTypeAt(checker, shapeNode);
      const shape = shapeForLegacyCandidate(checker, shapeNode);
      const consumerIdentity = candidate.boundary ? `${candidate.boundary.kind}:${candidate.boundary.label}` : "";
      const shapeId = `shape:${stableHash(`${route.key}:${candidate.kind}:${source.file}:${source.span.startLine}:${source.span.startColumn}:${consumerIdentity}:${outputType}`)}`;
      const consumerShape = candidate.consumerReturn ? shapeForLegacyCandidate(checker, candidate.consumerReturn) : null;
      const consumerShapeId = consumerShape
        ? `shape:${stableHash(`${route.key}:${candidate.kind}:consumer-return:${source.file}:${source.span.startLine}:${source.span.startColumn}:${consumerIdentity}:${consumerShape.typeText}`)}`
        : null;
      const valueId = `value:${stableHash(`${route.key}:${candidate.label}:${source.file}:${source.line}:${source.column}:${consumerIdentity}`)}`;
      const operationKey = `operation:${stableHash(`${route.key}:${candidate.kind}:${source.file}:${source.span.startLine}:${source.span.startColumn}:${source.compilerIdentity ?? ""}:${consumerIdentity}:${candidate.transportBridge?.id ?? ""}`)}`;
      const operation: DataOperation = {
        key: operationKey,
        semanticKind: candidate.kind,
        effect: candidate.effect,
        label: group.length > 1 ? `Read and validate ${group.length} persisted values` : candidate.label,
        inputValueIds: [],
        outputValueIds: [valueId],
        inputShapeIds: [],
        outputShapeIds: [shapeId],
        fieldEffects: candidate.fieldEffects.length ? candidate.fieldEffects : [{ kind: candidate.effect, field: null, detail: legacyEffectSummary(candidate.effect, shape) }],
        sourceExpressionIds: sources.map((item) => item.id),
        boundary: candidate.boundary,
        boundaryId: candidate.boundary?.kind === "resource" && ts.isVariableDeclaration(candidate.node.parent)
          ? resourceBoundaryIdentity(root, candidate.node.parent)
          : null,
        transportBridge: candidate.transportBridge,
        consumerHandoff: consumerShapeId ? {
          kind: "return",
          outputShapeId: consumerShapeId,
          fieldPaths: candidate.consumerFieldPaths,
        } : null,
        owner: candidate.boundary?.kind === "resource" ? legacyOperationOwner(ts, root, candidate) : null,
        confidence: candidate.confidence,
        completeness: candidate.kind === "opaque" ? "opaque" : candidate.confidence === "low" ? "partial" : "complete",
        completenessReason: candidate.kind === "opaque" ? "The compiler could not prove the internal value transition across this call." : "Retained from a participating source expression and checker type.",
      };
      operations.push(operation);
      values.push({ id: valueId, label: group.length > 1 ? "Saved persisted values" : legacyValueLabel(candidate, outputType), shapeId, sourceOperationKey: operationKey });
      shapes.push({ ...shape, id: shapeId });
      if (consumerShape && consumerShapeId) shapes.push({ ...consumerShape, id: consumerShapeId });
      evidence.push(...sources);
      routeOperationKeys.push(operationKey);
      routeValueIds.push(valueId);
    }

    const routeTerminals = buildLegacyTerminals(route, routeSinks, routeOperationKeys.at(-1) ?? null);
    terminals.push(...routeTerminals);
    const hasRead = selected.some((item) => item.kind === "read");
    const hasRender = selected.some((item) => item.kind === "render") || routeTerminals.length > 0;
    const omissions = [...route.omissions];
    if (!hasRead) omissions.push("No supported persistence source joined to this route.");
    if (!hasRender) omissions.push("No supported render terminal joined to the participating component files.");
    if (selected.some((item) => item.kind === "opaque")) omissions.push("At least one first-party or external call remains opaque.");
    omissions.push("Cards are ordered by semantic stage. Cross-operation argument, prop, and return-value handoffs are not yet proven.");
    if (routeOperationKeys.length) {
      trajectories.push({
        key: `trajectory:${stableHash(`${route.key}:${routeOperationKeys[0]}:${routeTerminals[0]?.id ?? routeOperationKeys.at(-1)}`)}`,
        routeKey: route.key,
        label: routeTerminals.length ? `${route.pathPattern} → ${routeTerminals.length} retained render ${routeTerminals.length === 1 ? "site" : "sites"}` : `${route.pathPattern} data path`,
        sourceValueIds: routeValueIds.filter((id) => {
          const value = values.find((item) => item.id === id);
          return operations.find((item) => item.key === value?.sourceOperationKey)?.semanticKind === "read";
        }),
        operationKeys: routeOperationKeys,
        terminalIds: routeTerminals.map((terminal) => terminal.id),
        supportingComponentIds: route.componentNames.map((name) => `component:${stableHash(`${route.file}:${name}`)}`),
        routeReachableTerminalCount: routeSinks.length,
        terminalSelectionLimit: 4,
        ordering: "semantic-stage",
        handoffsProven: false,
        completeness: routeOperationKeys.length ? "partial" : "unknown",
        omissions,
      });
    }
  }
  const routeData: RouteDataAnalysis = {
    routes,
    // Totality is an interactive detail concern. Keep the compact route and
    // trajectory inventory eager, but retain the provider for one selected
    // route so the workspace request does not build every route's frontier.
    routeTotality: [],
    trajectories,
    operations,
    values,
    shapes,
    evidence,
    terminals,
    shadowEvidence: buildRouteShadowEvidence(ts, program, root, routes, sinks),
  };
  registerRouteDataTotalitySession(
    routeData,
    createRouteDataTotalitySession(
      ts,
      program,
      root,
      routes,
      provider,
      solidRouteCandidates,
      findings,
    ),
  );
  return routeData;
}

function exactFileInputElementId(
  provider: ReturnType<typeof createLazyProgramEvidenceProvider>,
  node: TypeScript.Node,
  file: string,
  operationKind: string,
): string | null {
  if (operationKind !== "read") return null;
  const start = node.getStart(node.getSourceFile());
  const end = node.getEnd();
  const matches = provider.facts.fileCandidates(file).filter((fact) => (
    fact.kind === "file-input"
    && fact.confidence === "proven"
    && fact.proofKind === "host-api"
    && fact.attributes.operation === "readFile"
    && fact.attributes.module === "node:fs/promises"
    && fact.nodeStart === start
    && fact.nodeEnd === end
    && fact.nodeKind === node.kind
  ));
  return matches.length === 1 ? matches[0].id : null;
}

export function routeSinkKey(sink: Pick<Sink, "file" | "id">) {
  return `${sink.file}:${sink.id}`;
}

function collectRenderedComponents(ts: typeof TypeScript, checker: TypeScript.TypeChecker, root: string, routeFile: TypeScript.SourceFile, route: RouteRecord) {
  const keys = new Set<string>();
  const records = new Map<string, RouteComponentRecord>();
  const edges = new Map<string, { from: string; to: string }>();
  const queued = new Set<string>();
  const queue: Array<{ node: TypeScript.Node; id: string; ancestors: Set<string> }> = [];
  const componentIdentity = (node: TypeScript.Node, alias?: string) => {
    const sourceFile = node.getSourceFile();
    if (!inside(root, sourceFile.fileName)) return null;
    const name = declarationName(ts, node) ?? alias;
    if (!name) return null;
    const file = relative(root, sourceFile.fileName);
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const id = `rendered-component:${stableHash(`${file}:${node.getStart(sourceFile)}:${name}`)}`;
    return { id, name, file, line: point.line + 1 };
  };
  const enqueue = (node: TypeScript.Node, alias?: string, parentId: string | null = null, ancestors = new Set<string>()) => {
    const identity = componentIdentity(node, alias);
    if (!identity) return;
    const { id, name, file, line } = identity;
    keys.add(componentMembershipKey(file, name));
    if (alias) keys.add(componentMembershipKey(file, alias));
    if (!records.has(id)) records.set(id, { id, label: name, file, line, parentId: null, role: parentId ? "component" : "route" });
    if (parentId && parentId !== id) edges.set(`${parentId}:${id}`, { from: parentId, to: id });
    if (!queued.has(id)) { queued.add(id); queue.push({ node, id, ancestors }); }
  };
  const addRecursiveOccurrence = (node: TypeScript.Node, label: string, parentId: string) => {
    const sourceFile = node.getSourceFile();
    const file = relative(root, sourceFile.fileName);
    const point = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const id = `rendered-component-occurrence:${stableHash(`${file}:${node.getStart(sourceFile)}:${label}:${parentId}`)}`;
    records.set(id, { id, label, file, line: point.line + 1, parentId: null, role: "component" });
    edges.set(`${parentId}:${id}`, { from: parentId, to: id });
  };
  const resolveDeclaration = (node: TypeScript.Node) => {
    let symbol = checker.getSymbolAtLocation(node);
    try { if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol); } catch { /* unresolved alias */ }
    return symbol?.valueDeclaration ?? symbol?.declarations?.find((declaration) => isComponentDeclaration(ts, declaration)) ?? null;
  };
  const rootLabel = route.componentHierarchy.find((component) => component.parentId === null)?.label ?? null;
  let rootDeclaration: TypeScript.Node | null = null;
  const findRoot = (node: TypeScript.Node) => {
    if (rootDeclaration) return;
    if (declarationName(ts, node) === rootLabel && isComponentDeclaration(ts, node)) rootDeclaration = node;
    if (ts.isExportAssignment(node)) rootDeclaration = resolveDeclaration(node.expression) ?? rootDeclaration;
    ts.forEachChild(node, findRoot);
  };
  findRoot(routeFile);
  if (rootDeclaration) enqueue(rootDeclaration, rootLabel ?? undefined);
  else if (rootLabel) keys.add(componentMembershipKey(route.file, rootLabel));

  while (queue.length && queued.size <= 5_000) {
    const current = queue.shift()!;
    const visit = (node: TypeScript.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName) && /^[A-Z]/.test(node.tagName.text)) {
        const target = resolveDeclaration(node.tagName);
        const targetIdentity = target ? componentIdentity(target, node.tagName.text) : null;
        if (target && targetIdentity) {
          if (targetIdentity.id === current.id || current.ancestors.has(targetIdentity.id)) {
            addRecursiveOccurrence(node, node.tagName.text, current.id);
          } else {
            enqueue(target, node.tagName.text, current.id, new Set(current.ancestors).add(current.id));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(current.node);
  }
  return { keys, records: [...records.values()], edges: [...edges.values()] };
}

function sinkBelongsToRenderedComponent(sink: Sink, route: RouteRecord, renderedComponents: Set<string>) {
  const component = sink.renderContext?.component?.trim();
  if (component && renderedComponents.has(componentMembershipKey(sink.file, component))) return true;
  return !component && sink.file === route.file;
}

function componentMembershipKey(file: string, component: string) { return `${file.replaceAll("\\", "/")}:${component}`; }
function isComponentDeclaration(ts: typeof TypeScript, node: TypeScript.Node) {
  return ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node) && Boolean(node.initializer);
}
function declarationName(ts: typeof TypeScript, node: TypeScript.Node) {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) return node.name.text;
  return null;
}
function lexical(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function safeTypeAt(checker: TypeScript.TypeChecker, node: TypeScript.Node) { try { return checker.typeToString(checker.getTypeAtLocation(node), node, 1); } catch { return "unknown"; } }
function relative(root: string, file: string) { return path.relative(root, file).replaceAll(path.sep, "/"); }
function inside(root: string, file: string) { const rel = path.relative(path.resolve(root), path.resolve(file)); return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".."); }
