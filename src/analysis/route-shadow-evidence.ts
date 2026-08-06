import path from "node:path";
import type * as TypeScript from "typescript";
import type { Sink, SourceSpan } from "../types";
import { collectReachableFiles, stableHash } from "./route-discovery";
import type { RouteRecord } from "./route-data";
import {
  buildPluckComponentOccurrenceDiagnostic,
  type SourcePathSeed,
} from "./component-occurrence-identity";
import {
  contextBridgeFor,
  finish,
  findFunction,
  findQueryWrapper,
  inspectorPageProp,
  initializerCallFor,
  jsxPropFor,
  jsxPropForwardingFor,
  loadedDetailResult,
  originNodeFor,
  proof,
  proofFromLocations,
  providerValueFor,
  resourceResultFor,
  returnCallFor,
  returnContainingCall,
  selectOrigin,
  selectTerminal,
  sourceFiles,
  TARGET_INSPECTOR_FILE,
  TARGET_ROUTE,
  TARGET_ROUTE_FILE,
  TARGET_SHELL_FILE,
  TARGET_WORKSPACE_FILE,
  terminalPathProof,
  terminalNodeFor,
  unavailableEvidence,
} from "./route-shadow-evidence-compiler";
import { locationForNode, symbolFor } from "./route-shadow-evidence-support";
export type ShadowEvidenceStatus = "proven" | "partial" | "unavailable";
export type ShadowLocation = {
  file: string;
  line: number;
  column: number;
  span: SourceSpan;
};

export type RouteShadowEvidence = {
  status: ShadowEvidenceStatus;
  route: { key: string; pathPattern: string; file: string };
  origin: {
    id: string;
    kind: "filesystem";
    label: string;
    definition: {
      id: string;
      name: string;
      module: string | null;
      compilerIdentity: string;
      location: ShadowLocation | null;
    };
    occurrence: {
      id: string;
      expression: string;
      compilerIdentity: string;
      location: ShadowLocation;
    };
  } | null;
  terminal: {
    id: string;
    kind: "jsx-text" | "dom-attribute" | "style";
    label: string;
    component: string | null;
    location: ShadowLocation;
  } | null;
  nodes: Array<{
    id: string;
    role: "origin" | "handoff" | "terminal";
    kind: string;
    label: string;
    location: ShadowLocation | null;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    kind: "origin-read" | "call-return" | "resource-result" | "component-prop" | "context-member" | "property-read" | "render-terminal" | "render-occurrence" | "transparent-splice";
    proof: {
      kind: "compiler-symbol" | "return-expression" | "argument-binding" | "resource-result" | "component-prop" | "context-member" | "property-read" | "render-sink" | "parent-occurrence" | "transparent-wrapper-splice";
      detail: string;
      locations: ShadowLocation[];
    };
  }>;
  gaps: Array<{
    id: string;
    from: string;
    to: string | null;
    label: string;
    reason: "unsupported-syntax" | "dynamic-dispatch" | "external-code" | "identity-lost" | "unresolved-symbol";
    location: ShadowLocation | null;
  }>;
  truncation: { nodes: boolean; edges: boolean; gaps: boolean };
  occurrenceEvidence: ReturnType<typeof buildPluckComponentOccurrenceDiagnostic> | null;
};

export function buildRouteShadowEvidence(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  routes: RouteRecord[],
  sinks: Sink[],
): RouteShadowEvidence | null {
  const route = routes.find((candidate) => candidate.pathPattern === TARGET_ROUTE);
  if (!route) return null;
  const routeInfo = { key: route.key, pathPattern: route.pathPattern, file: route.file };
  const files = sourceFiles(program, root);
  const routeFile = files.get(path.normalize(path.resolve(root, route.file)));
  const reachable = routeFile
    ? collectReachableFiles(ts, root, routeFile, files)
    : new Set<string>();
  const origin = selectOrigin(ts, program.getTypeChecker(), root, files, reachable);
  const terminal = selectTerminal(route, sinks, root);
  if (!origin || !terminal) return withOccurrenceEvidence(unavailableEvidence(routeInfo, origin, terminal, root), ts, program, root, route.key);

  const checker = program.getTypeChecker();
  const originLocation = locationForNode(root, origin.call);
  const originNode = originNodeFor(origin, root);
  const terminalNode = terminalNodeFor(terminal);
  const nodes: RouteShadowEvidence["nodes"] = [originNode];
  const edges: RouteShadowEvidence["edges"] = [];
  const gaps: RouteShadowEvidence["gaps"] = [];
  let current = originNode.id;

  const addHandoff = (
    label: string,
    kind: RouteShadowEvidence["edges"][number]["kind"],
    nodeKind: string,
    proof: RouteShadowEvidence["edges"][number]["proof"] | null,
    location: ShadowLocation | null,
  ) => {
    const nextId = `shadow-node:${stableHash(`${current}:${label}`)}`;
    if (!proof || proof.locations.length === 0) {
      gaps.push({
        id: `shadow-gap:${stableHash(`${current}:${label}`)}`,
        from: current,
        to: null,
        label,
        reason: "identity-lost",
        location,
      });
      return false;
    }
    nodes.push({ id: nextId, role: "handoff", kind: nodeKind, label, location });
    edges.push({
      id: `shadow-edge:${stableHash(`${current}:${nextId}:${kind}`)}`,
      from: current,
      to: nextId,
      kind,
      proof,
    });
    current = nextId;
    return true;
  };

  const jsonFunction = findFunction(ts, files, "readJsonFile", "app/src/lib/pluck/store/json.ts");
  const jsonReturn = jsonFunction && returnContainingCall(ts, jsonFunction.declaration, origin.call);
  if (!addHandoff(
    "readFile → readJsonFile result",
    "origin-read",
    "parsed-json-result",
    jsonReturn
      ? proof("return-expression", "The selected readFile call is part of readJsonFile's returned parse expression.", root, [origin.call, jsonReturn])
      : null,
    jsonReturn ? locationForNode(root, jsonReturn) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const readJsonSymbol = jsonFunction ? symbolFor(checker, jsonFunction.nameNode) : null;
  const captureDetail = findFunction(ts, files, "readCaptureDetail", "app/src/lib/pluck/store/capture-detail.ts");
  const pageRead = captureDetail && readJsonSymbol
    ? initializerCallFor(ts, checker, captureDetail.declaration, "page", readJsonSymbol, "pageManifest")
    : null;
  if (!addHandoff(
    "readJsonFile result → readCaptureDetail.page",
    "call-return",
    "capture-page",
    pageRead
      ? proof("compiler-symbol", "The page value is assigned from the compiler-resolved readJsonFile call.", root, [pageRead.call, pageRead.variable])
      : null,
    pageRead ? locationForNode(root, pageRead.variable) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const captureDetailSymbol = captureDetail ? symbolFor(checker, captureDetail.nameNode) : null;
  const loadCaptureDetail = findFunction(ts, files, "loadCaptureDetail", "app/src/lib/pluck/store/queries.server.ts");
  const serverReturn = loadCaptureDetail && captureDetailSymbol
    ? returnCallFor(ts, checker, loadCaptureDetail.declaration, captureDetailSymbol, "readCaptureDetail")
    : null;
  if (!addHandoff(
    "readCaptureDetail → loadCaptureDetail",
    "call-return",
    "server-query-result",
    serverReturn
      ? proof("compiler-symbol", "The server query returns the compiler-resolved readCaptureDetail result.", root, [serverReturn.call, serverReturn.returnStatement])
      : null,
    serverReturn ? locationForNode(root, serverReturn.returnStatement) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const loadCaptureSymbol = loadCaptureDetail ? symbolFor(checker, loadCaptureDetail.nameNode) : null;
  const queryWrapper = loadCaptureSymbol
    ? findQueryWrapper(ts, checker, files, "getCaptureDetail", loadCaptureSymbol)
    : null;
  const routeFunction = findFunction(ts, files, "CaptureRouteContent", TARGET_ROUTE_FILE);
  const resource = routeFunction && queryWrapper
    ? resourceResultFor(ts, checker, routeFunction.declaration, queryWrapper.symbol)
    : null;
  if (!addHandoff(
    "loadCaptureDetail → fullDetail resource",
    "resource-result",
    "resource-result",
    resource
      ? proof("resource-result", "The fullDetail resource callback returns getCaptureDetail, whose compiler-resolved query wrapper returns loadCaptureDetail.", root, [resource.resourceCall, resource.queryCall, queryWrapper!.loadCall])
      : null,
    resource ? locationForNode(root, resource.resourceCall) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const resolvedLatest = findFunction(ts, files, "resolvedResourceLatest", TARGET_ROUTE_FILE);
  const loadedDetail = routeFunction && resource && resolvedLatest
    ? loadedDetailResult(ts, checker, routeFunction.declaration, resource.bindingName, resolvedLatest)
    : null;
  if (!addHandoff(
    "fullDetail resource → loadedDetail",
    "resource-result",
    "loaded-detail",
    loadedDetail
      ? proof("return-expression", "The selected fullDetail resource is passed to resolvedResourceLatest, whose return reads resource.latest.", root, [loadedDetail.resourceUse, loadedDetail.latestReturn])
      : null,
    loadedDetail ? locationForNode(root, loadedDetail.latestReturn) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const shellProp = routeFunction && loadedDetail
    ? jsxPropFor(ts, checker, routeFunction.declaration, "CaptureViewerRouteShell", "detail", loadedDetail.bindingName)
    : null;
  if (!addHandoff(
    "loadedDetail → CaptureViewerRouteShell.detail",
    "component-prop",
    "route-shell-prop",
    shellProp
      ? proof("component-prop", "The route JSX passes the compiler-resolved loadedDetail accessor to the shell detail prop.", root, [shellProp.attribute, shellProp.value])
      : null,
    shellProp ? locationForNode(root, shellProp.attribute) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const shell = findFunction(ts, files, "CaptureViewerRouteShell", TARGET_SHELL_FILE);
  const workspaceProp = shell
    ? jsxPropForwardingFor(ts, checker, shell.declaration, "CaptureDetailWorkspace", "detail")
    : null;
  if (!addHandoff(
    "CaptureViewerRouteShell.detail → CaptureDetailWorkspace.detail",
    "component-prop",
    "workspace-prop",
    workspaceProp
      ? proof("component-prop", "The shell forwards its detail parameter to the workspace detail prop.", root, [workspaceProp.attribute, workspaceProp.value])
      : null,
    workspaceProp ? locationForNode(root, workspaceProp.attribute) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const workspace = findFunction(ts, files, "CaptureDetailWorkspace", TARGET_WORKSPACE_FILE);
  const providerValue = workspace
    ? providerValueFor(ts, checker, workspace.declaration)
    : null;
  if (!addHandoff(
    "CaptureDetailWorkspace.detail → CaptureViewerProvider.value",
    "component-prop",
    "context-provider-value",
    providerValue
      ? proof("component-prop", "The workspace model receives a compiler-linked detail property access and supplies its compiler-linked viewer value to the context provider.", root, [providerValue.detailAccess, providerValue.providerValue])
      : null,
    providerValue ? locationForNode(root, providerValue.providerValue) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const contextBridge = contextBridgeFor(ts, checker, files);
  if (!addHandoff(
    "CaptureViewerProvider.value → useCaptureViewer()",
    "context-member",
    "context-member",
    contextBridge
      ? proof("context-member", "The provider and consumer use the same compiler-resolved CaptureViewerContext symbol.", root, [contextBridge.provider, contextBridge.consumer])
      : null,
    contextBridge ? locationForNode(root, contextBridge.consumer) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const inspector = findFunction(ts, files, "CaptureInspectorContent", TARGET_INSPECTOR_FILE);
  const pageProp = inspector ? inspectorPageProp(ts, checker, inspector.declaration) : null;
  if (!addHandoff(
    "useCaptureViewer().detail → CaptureStatsPanel.page",
    "component-prop",
    "stats-page-prop",
    pageProp
      ? proof("component-prop", "The compiler-linked useCaptureViewer detail member resolves to the compiler-linked page property passed to CaptureStatsPanel.", root, [pageProp.detailUse, pageProp.pageAttribute])
      : null,
    pageProp ? locationForNode(root, pageProp.pageAttribute) : originLocation,
  )) return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);

  const terminalPath = terminalPathProof(ts, checker, files, root, terminal);
  if (!terminalPath) {
    gaps.push({
      id: `shadow-gap:${stableHash(`${current}:render-terminal`)}`,
      from: current,
      to: terminalNode.id,
      label: "CaptureStatsPanel.page → selected JSX terminal",
      reason: "unresolved-symbol",
      location: terminal.location,
    });
    return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);
  }
  const pageNode = {
    id: `shadow-node:${stableHash(`${current}:CaptureStatsPanel.page`)}`,
    role: "handoff" as const,
    kind: "component-prop",
    label: "CaptureStatsPanel.page",
    location: terminalPath.page.location,
  };
  nodes.push(pageNode);
  edges.push({
    id: `shadow-edge:${stableHash(`${current}:${pageNode.id}:component-prop`)}`,
    from: current,
    to: pageNode.id,
    kind: "component-prop",
    proof: proofFromLocations("component-prop", "The selected terminal's compiler trace begins at the CaptureStatsPanel page prop.", [terminalPath.page.location]),
  });
  current = pageNode.id;
  for (const property of terminalPath.properties) {
    const node = { id: `shadow-node:${stableHash(`${current}:${property.label}`)}`, role: "handoff" as const, kind: "property-read", label: property.label, location: property.location };
    nodes.push(node);
    edges.push({
      id: `shadow-edge:${stableHash(`${current}:${node.id}:property-read`)}`,
      from: current,
      to: node.id,
      kind: "property-read",
      proof: proofFromLocations("property-read", `The selected sink trace records the ${property.label} property read.`, [property.location]),
    });
    current = node.id;
  }
  nodes.push(terminalNode);
  edges.push({
    id: `shadow-edge:${stableHash(`${current}:${terminalNode.id}:render-terminal`)}`,
    from: current,
    to: terminalNode.id,
    kind: "render-terminal",
    proof: proofFromLocations("render-sink", "The selected compiler-backed sink renders the traced value at the exact terminal location.", [terminal.location]),
  });
  return finishWithOccurrence(routeInfo, origin, terminal, nodes, terminalNode, edges, gaps, root, ts, program);
}

function finishWithOccurrence(
  route: RouteShadowEvidence["route"],
  origin: Parameters<typeof finish>[1],
  terminal: Parameters<typeof finish>[2],
  nodes: RouteShadowEvidence["nodes"],
  terminalNode: RouteShadowEvidence["nodes"][number],
  edges: RouteShadowEvidence["edges"],
  gaps: RouteShadowEvidence["gaps"],
  root: string,
  ts: typeof TypeScript,
  program: TypeScript.Program,
) {
  return withOccurrenceEvidence(finish(route, origin, terminal, nodes, terminalNode, edges, gaps, root), ts, program, root, route.key);
}

function withOccurrenceEvidence(
  evidence: RouteShadowEvidence,
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  scopeId: string,
): RouteShadowEvidence {
  const seed = evidence.status === "proven" && evidence.origin && evidence.terminal
    ? sourcePathSeedFor(evidence, scopeId)
    : null;
  const occurrenceEvidence = buildPluckComponentOccurrenceDiagnostic(ts, program, root, seed, scopeId);
  const status = evidence.status === "proven" && occurrenceEvidence.status !== "proven"
    ? "partial"
    : evidence.status;
  const projected = projectOccurrencePath({ ...evidence, status, occurrenceEvidence });
  return boundShadowEvidence(projected);
}

function sourcePathSeedFor(evidence: RouteShadowEvidence, scopeId: string): SourcePathSeed {
  const origin = evidence.origin!;
  const terminal = evidence.terminal!;
  const locations = [
    origin.occurrence.location,
    ...evidence.edges.flatMap((edge) => edge.proof.locations),
    terminal.location,
  ];
  return {
    sourceOccurrenceId: origin.occurrence.id,
    sourceCompilerIdentity: origin.occurrence.compilerIdentity,
    sourceLocation: origin.occurrence.location,
    terminalLocation: terminal.location,
    scopeId,
    proof: {
      kind: "compiler-backed-route-slice",
      detail: "The selected route source and terminal are joined by the completed compiler-backed shadow slice.",
      locations,
    },
  };
}

function projectOccurrencePath(evidence: RouteShadowEvidence): RouteShadowEvidence {
  const occurrenceEvidence = evidence.occurrenceEvidence;
  if (
    !occurrenceEvidence
    || occurrenceEvidence.sourcePath.status !== "proven"
    || !occurrenceEvidence.component
    || !occurrenceEvidence.projection
  ) return evidence;

  const occurrenceById = new Map(occurrenceEvidence.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const sourcePathIds = new Set(occurrenceEvidence.sourcePath.occurrenceIds);
  const hiddenWrapperId = occurrenceEvidence.selectedWrapperOccurrenceId;
  if (hiddenWrapperId) sourcePathIds.delete(hiddenWrapperId);
  const reattachedIds = new Set(occurrenceEvidence.projection.reattachedChildOccurrenceIds);
  const visibleOccurrenceIds = new Set([...sourcePathIds, ...reattachedIds]);
  visibleOccurrenceIds.add(occurrenceEvidence.component.occurrence.id);
  const pageNode = evidence.nodes.find((node) => node.role === "handoff"
    && node.kind === "component-prop"
    && node.location?.file === occurrenceEvidence.terminal?.file
    && node.location?.line === occurrenceEvidence.terminal?.line);
  if (!pageNode) return evidence;

  const rootOccurrence = occurrenceEvidence.component.occurrence;
  const rootOccurrenceId = rootOccurrence.id;
  const nodes = evidence.nodes.map((node) => node.id === pageNode.id
    ? {
        ...node,
        id: rootOccurrenceId,
        kind: "component-occurrence",
        label: `${rootOccurrence.name} occurrence`,
        location: rootOccurrence.callSite,
      }
    : node,
  );
  for (const occurrenceId of occurrenceEvidence.sourcePath.occurrenceIds) {
    if (occurrenceId === rootOccurrenceId || !visibleOccurrenceIds.has(occurrenceId)) continue;
    const occurrence = occurrenceById.get(occurrenceId);
    if (!occurrence || nodes.some((node) => node.id === occurrence.id)) continue;
    nodes.push({
      id: occurrence.id,
      role: "handoff",
      kind: "component-occurrence",
      label: `${occurrence.name} occurrence`,
      location: occurrence.callSite,
    });
  }
  for (const occurrenceId of occurrenceEvidence.projection.reattachedChildOccurrenceIds) {
    if (!visibleOccurrenceIds.has(occurrenceId)) continue;
    const occurrence = occurrenceById.get(occurrenceId);
    if (!occurrence || nodes.some((node) => node.id === occurrence.id)) continue;
    nodes.push({
      id: occurrence.id,
      role: "handoff",
      kind: "component-occurrence",
      label: `${occurrence.name} occurrence`,
      location: occurrence.callSite,
    });
  }

  const edges = evidence.edges.map((edge) => {
    const from = edge.from === pageNode.id ? rootOccurrenceId : edge.from;
    const to = edge.to === pageNode.id ? rootOccurrenceId : edge.to;
    return from === edge.from && to === edge.to
      ? edge
      : { ...edge, id: `shadow-edge:${stableHash(`${from}:${to}:${edge.kind}`)}`, from, to };
  });
  const selectedTerminalOccurrenceId = [...occurrenceEvidence.sourcePath.occurrenceIds].at(-1) ?? rootOccurrenceId;
  const firstPropertyEdge = edges.find((edge) => edge.kind === "property-read" && edge.from === rootOccurrenceId);
  if (firstPropertyEdge && selectedTerminalOccurrenceId !== rootOccurrenceId && occurrenceById.has(selectedTerminalOccurrenceId)) {
    const index = edges.indexOf(firstPropertyEdge);
    edges[index] = {
      ...firstPropertyEdge,
      id: `shadow-edge:${stableHash(`${selectedTerminalOccurrenceId}:${firstPropertyEdge.to}:${firstPropertyEdge.kind}`)}`,
      from: selectedTerminalOccurrenceId,
    };
  }

  for (const projectionEdge of occurrenceEvidence.projection.visibleEdges) {
    if (!visibleOccurrenceIds.has(projectionEdge.fromOccurrenceId) || !visibleOccurrenceIds.has(projectionEdge.toOccurrenceId)) continue;
    if (!occurrenceById.has(projectionEdge.fromOccurrenceId) || !occurrenceById.has(projectionEdge.toOccurrenceId)) continue;
    const kind = projectionEdge.kind === "transparent-splice" ? "transparent-splice" as const : "render-occurrence" as const;
    const id = `shadow-edge:${stableHash(`${projectionEdge.fromOccurrenceId}:${projectionEdge.toOccurrenceId}:${kind}`)}`;
    if (edges.some((edge) => edge.id === id)) continue;
    edges.push({
      id,
      from: projectionEdge.fromOccurrenceId,
      to: projectionEdge.toOccurrenceId,
      kind,
      proof: {
        kind: projectionEdge.evidence.kind,
        detail: projectionEdge.evidence.detail,
        locations: projectionEdge.evidence.locations,
      },
    });
  }
  return { ...evidence, nodes, edges };
}

const SHADOW_NODE_LIMIT = 32;
const SHADOW_EDGE_LIMIT = 31;
const SHADOW_GAP_LIMIT = 8;

function boundShadowEvidence(evidence: RouteShadowEvidence): RouteShadowEvidence {
  const truncation = {
    nodes: evidence.truncation.nodes || evidence.nodes.length > SHADOW_NODE_LIMIT,
    edges: evidence.truncation.edges || evidence.edges.length > SHADOW_EDGE_LIMIT,
    gaps: evidence.truncation.gaps || evidence.gaps.length > SHADOW_GAP_LIMIT,
  };
  const nodes = evidence.nodes.slice(0, SHADOW_NODE_LIMIT);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = evidence.edges.slice(0, SHADOW_EDGE_LIMIT).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const gaps = evidence.gaps.slice(0, SHADOW_GAP_LIMIT).filter((gap) => nodeIds.has(gap.from) && (!gap.to || nodeIds.has(gap.to)));
  const status = evidence.status === "unavailable"
    ? "unavailable"
    : evidence.status === "proven" && !Object.values(truncation).some(Boolean)
      ? "proven"
      : "partial";
  return { ...evidence, status, nodes, edges, gaps, truncation };
}
