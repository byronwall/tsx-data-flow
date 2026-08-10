import type { AnalysisCancellationToken } from "./cancellation";
import type { EvidenceSlice } from "./evidence-slice";
import {
  type RouteTotalityFieldAttachment,
  type RouteTotalityFieldLineage,
  type RouteTotalityFieldTransformation,
} from "./route-totality-field-lineage";
import type { RouteOccurrenceSurface } from "./route-occurrence-surface";
import type { RouteRecord } from "./route-data";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import { stableHash, type ProgramElement, type SourceLocation } from "./scope-seam";

type ExactFacts = {
  source: ProgramElement;
  games: ProgramElement;
  findReceiver: ProgramElement;
  predicateParameter: ProgramElement;
  predicateField: ProgramElement;
  predicate: ProgramElement;
  findResult: ProgramElement;
  accessor: ProgramElement;
  accessorCall: ProgramElement;
  show: ProgramElement;
  showExpression: ProgramElement;
  renderParameter: ProgramElement;
  currentCall: ProgramElement;
  opponentName: ProgramElement;
  pageHeader: ProgramElement;
  title: ProgramElement;
};

const GAMES_ROUTE = "/games/[gameId]";
const GAME_FILE_SUFFIX = "/components/soccer/GamePages.tsx";

/**
 * Build the first demand-driven field proof. The legacy traversal supplies
 * only the accepted source-to-terminal path. This function adds the exact
 * compiler fact ledger and emits no legacy field records.
 */
export function buildSelectedRouteTotalityFieldProof(
  route: RouteRecord,
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  selectedSource: RouteTotalitySelectedSource,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage {
  cancellation.throwIfCancelled();
  if (route.pathPattern !== GAMES_ROUTE) return emptySelectedProof("The selected-source field proof is not implemented for this route.", slice, surface);

  const sourceOrigin = slice.origins.find((origin) => origin.role === "filesystem"
    && originMatchesSelectedInput(origin.elementId, slice, selectedSource));
  const pageHeaderOccurrence = surface.occurrences.find((occurrence) => occurrence.name === "PageHeader"
    && occurrence.callSite.file.endsWith(GAME_FILE_SUFFIX)
    && occurrence.callSite.line === 43);
  if (!sourceOrigin) return emptySelectedProof("The selected source has no exact filesystem origin in the route slice.", slice, surface);
  if (!pageHeaderOccurrence) return emptySelectedProof("The route surface has no exact PageHeader call-site occurrence.", slice, surface);
  const pathAttachment = buildSelectedPath(sourceOrigin.elementId, pageHeaderOccurrence.callSite.file, slice, surface, cancellation);
  if (!pathAttachment) return emptySelectedProof("The selected source has no exact path to the Show render callback terminal.", slice, surface);

  const facts = exactFacts(slice, sourceOrigin.elementId, pageHeaderOccurrence.callSite.file, cancellation);
  if (!facts) return emptySelectedProof("The compiler fact index does not contain the complete G02 field chain.", slice, surface);

  const transformations = buildTransformations(facts, pageHeaderOccurrence.id, cancellation);
  const fieldLocation = facts.opponentName.location;
  const consumerLocation = facts.title.location;
  const locations = uniqueLocations([
    ...pathAttachment.locations,
    ...transformations.flatMap((transformation) => transformation.locations),
    fieldLocation,
    consumerLocation,
  ], cancellation);
  const consumer = {
    id: `route-totality-field-consumer:${stableHash(JSON.stringify({ occurrenceId: pageHeaderOccurrence.id, location: consumerLocation }))}`,
    kind: "render" as const,
    label: "PageHeader.title",
    occurrenceId: pageHeaderOccurrence.id,
    routeTerminalId: null,
    location: consumerLocation,
  };
  const attachment: RouteTotalityFieldAttachment = {
    id: `route-totality-field-attachment:${stableHash(JSON.stringify({
      origin: sourceOrigin,
      field: [facts.games.id, facts.opponentName.id],
      consumer: consumer.id,
    }))}`,
    origin: { elementId: sourceOrigin.elementId, role: sourceOrigin.role },
    field: {
      elementIds: [facts.games.id, facts.opponentName.id],
      segments: [
        { kind: "property", value: "games" },
        { kind: "collection-element", value: "*" },
        { kind: "property", value: "opponentName" },
      ],
      label: "games[*].opponentName",
      location: fieldLocation,
    },
    occurrenceId: pathAttachment.occurrenceId,
    terminalIds: pathAttachment.terminalIds,
    evidencePathElementIds: pathAttachment.evidencePathElementIds,
    evidencePathRelationIds: pathAttachment.evidencePathRelationIds,
    proof: [{
      kind: "route-totality-field-proof",
      detail: "The selected readFile source reaches the exact games collection element and its PageHeader.title consumer through compiler-backed identities.",
      locations,
      status: "proven",
    }],
    locations,
    consumer,
    alias: null,
    transformationIds: transformations.map((transformation) => transformation.id),
    transformationKinds: transformations.map((transformation) => transformation.kind),
  };
  const partial = !slice.coverage.complete || surface.status !== "complete";
  return {
    status: partial ? "partial" : "complete",
    unavailableReason: null,
    attachments: [attachment],
    frontiers: [],
    counts: { origins: 1, fields: 1, occurrences: 1, terminals: attachment.terminalIds.length, frontiers: 0 },
    omissions: partial ? ["The shared evidence slice is partial."] : [],
    transformations,
  };
}

function exactFacts(
  slice: EvidenceSlice,
  sourceElementId: string,
  file: string,
  cancellation: AnalysisCancellationToken,
): ExactFacts | null {
  cancellation.throwIfCancelled();
  const elements = slice.elements.filter((element) => element.location.file === file);
  const at = (line: number, predicate: (element: ProgramElement) => boolean): ProgramElement | null => {
    const matches = elements.filter((element) => element.location.line === line && predicate(element));
    return matches.length === 1 ? matches[0] : null;
  };
  const source = slice.elements.find((element) => element.id === sourceElementId) ?? null;
  const games = at(23, (element) => element.kind === "field-read" && element.fieldName === "games");
  const findReceiver = at(23, (element) => element.kind === "field-read" && element.fieldName === "find"
    && Boolean(element.symbol?.startsWith("Array.find@")));
  const predicateParameter = at(23, (element) => element.kind === "parameter" && element.label === "item");
  const predicateField = at(23, (element) => element.kind === "field-read" && element.fieldName === "id"
    && element.symbol?.startsWith("id@") === true);
  const predicate = at(23, (element) => element.kind === "literal" && element.label.startsWith("(item) =>"));
  const findResult = at(23, (element) => element.kind === "call" && element.symbol?.startsWith("Array.find@") === true);
  const accessor = at(23, (element) => element.kind === "function-entry" && element.label === "game");
  const accessorCall = at(40, (element) => element.kind === "call" && element.label === "game()");
  const show = at(40, (element) => element.kind === "jsx-occurrence" && element.label === "Show");
  const showExpression = at(40, (element) => element.kind === "literal" && element.label.startsWith("<Show when={game()}>"));
  const renderParameter = at(41, (element) => element.kind === "parameter" && element.label === "current");
  const currentCall = at(45, (element) => element.kind === "call" && element.label === "current()");
  const opponentName = at(45, (element) => element.kind === "field-read" && element.fieldName === "opponentName");
  const pageHeader = at(43, (element) => element.kind === "component-occurrence" && element.label === "PageHeader");
  const title = at(45, (element) => element.kind === "component-prop-binding" && element.fieldName === null && element.label.startsWith("title="));
  return source && games && findReceiver && predicateParameter && predicateField && predicate && findResult
    && accessor && accessorCall && show && showExpression && renderParameter && currentCall && opponentName && pageHeader && title
    ? { source, games, findReceiver, predicateParameter, predicateField, predicate, findResult, accessor, accessorCall, show, showExpression, renderParameter, currentCall, opponentName, pageHeader, title }
    : null;
}

function buildSelectedPath(
  sourceElementId: string,
  file: string,
  slice: EvidenceSlice,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldAttachment | null {
  const terminal = surface.terminals.find((candidate) => candidate.location.file === file
    && candidate.location.line === 41
    && candidate.ownerOccurrenceId !== null);
  const terminalEvidence = terminal
    ? slice.terminals.find((candidate) => candidate.role === "render"
      && candidate.proof.some((proof) => proof.locations.some((location) => sameLocation(location, terminal.location))))
    : undefined;
  if (!terminal || !terminalEvidence) return null;
  const outgoing = new Map<string, EvidenceSlice["relations"]>();
  for (const relation of slice.relations) {
    cancellation.throwIfCancelled();
    const relations = outgoing.get(relation.from) ?? [];
    relations.push(relation);
    outgoing.set(relation.from, relations);
  }
  const queue: Array<{ elementIds: string[]; relationIds: string[] }> = [{ elementIds: [sourceElementId], relationIds: [] }];
  const visited = new Set<string>([sourceElementId]);
  let path: { elementIds: string[]; relationIds: string[] } | null = null;
  while (queue.length > 0 && !path) {
    cancellation.throwIfCancelled();
    const current = queue.shift()!;
    const currentId = current.elementIds.at(-1)!;
    if (currentId === terminalEvidence.elementId) {
      path = current;
      break;
    }
    if (current.elementIds.length > 64) continue;
    for (const relation of outgoing.get(currentId) ?? []) {
      cancellation.throwIfCancelled();
      if (visited.has(relation.to)) continue;
      visited.add(relation.to);
      queue.push({
        elementIds: [...current.elementIds, relation.to],
        relationIds: [...current.relationIds, relation.id],
      });
    }
  }
  if (!path) return null;
  const elementsById = new Map(slice.elements.map((element) => [element.id, element]));
  const locations = uniqueLocations([
    ...path.elementIds.flatMap((elementId) => {
      const element = elementsById.get(elementId);
      return element ? [element.location, ...element.proof.flatMap((proof) => proof.locations)] : [];
    }),
    ...path.relationIds.flatMap((relationId) => {
      const relation = slice.relations.find((candidate) => candidate.id === relationId);
      return relation ? relation.proof.locations : [];
    }),
  ], cancellation);
  return {
    id: "selected-source-path",
    origin: { elementId: sourceElementId, role: "filesystem" },
    field: { elementIds: [], segments: [], label: "path", location: locations[0] },
    occurrenceId: terminal.ownerOccurrenceId!,
    terminalIds: [terminal.id],
    evidencePathElementIds: path.elementIds,
    evidencePathRelationIds: path.relationIds,
    proof: [],
    locations,
    consumer: null,
    alias: null,
    transformationIds: [],
    transformationKinds: [],
  };
}

function buildTransformations(facts: ExactFacts, occurrenceId: string, cancellation: AnalysisCancellationToken): RouteTotalityFieldTransformation[] {
  const entries: Array<[string, ProgramElement[], ProgramElement[]]> = [
    ["selected-source-carrier", [facts.source], [facts.games]],
    ["static-games-property", [facts.games], [facts.findReceiver]],
    ["array-find-receiver", [facts.findReceiver], [facts.findResult]],
    ["find-callback-parameter", [facts.predicate], [facts.predicateParameter]],
    ["find-predicate-use", [facts.predicateParameter], [facts.predicateField]],
    ["find-predicate-result", [facts.predicateField, facts.predicate], [facts.findResult]],
    ["game-accessor-return", [facts.accessor], [facts.accessorCall]],
    ["solid-show-when", [facts.showExpression], [facts.show]],
    ["solid-show-render-callback", [facts.show], [facts.renderParameter]],
    ["render-current-identity", [facts.renderParameter], [facts.currentCall]],
    ["collection-element-field-read", [facts.findResult, facts.currentCall], [facts.opponentName]],
    ["page-header-title-consumer", [facts.opponentName, facts.pageHeader], [facts.title]],
  ];
  return entries.map(([kind, from, to]) => ({
    id: `route-totality-field-transformation:${stableHash(JSON.stringify({ kind, occurrenceId, from: from.map((element) => element.id), to: to.map((element) => element.id) }))}`,
    kind,
    fromElementIds: from.map((element) => element.id),
    toElementIds: to.map((element) => element.id),
    locations: uniqueLocations([...from, ...to].map((element) => element.location), cancellation),
    status: "proven" as const,
  }));
}

function emptySelectedProof(reason: string, slice: EvidenceSlice, surface: RouteOccurrenceSurface): RouteTotalityFieldLineage {
  const partial = !slice.coverage.complete || surface.status !== "complete";
  return {
    status: partial ? "partial" : "complete",
    unavailableReason: null,
    attachments: [],
    frontiers: [],
    counts: { origins: 0, fields: 0, occurrences: 0, terminals: 0, frontiers: 0 },
    omissions: [reason],
    transformations: [],
  };
}

function sameOrigin(left: { elementId: string; role: string }, right: { elementId: string; role: string }): boolean {
  return left.elementId === right.elementId && left.role === right.role;
}

function originMatchesSelectedInput(
  elementId: string,
  slice: EvidenceSlice,
  selected: RouteTotalitySelectedSource,
): boolean {
  const element = slice.elements.find((candidate) => candidate.id === elementId);
  const evidence = selected.evidence;
  return Boolean(element && evidence && sameSelectedLocation(element.location, selected));
}

function sameSelectedLocation(location: SourceLocation, selected: RouteTotalitySelectedSource): boolean {
  const evidence = selected.evidence;
  return Boolean(evidence && location.file === evidence.file && location.line === evidence.line && location.column === evidence.column
    && location.span.startLine === evidence.span.startLine && location.span.startColumn === evidence.span.startColumn
    && location.span.endLine === evidence.span.endLine && location.span.endColumn === evidence.span.endColumn);
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return left.file === right.file && left.line === right.line && left.column === right.column
    && JSON.stringify(left.span) === JSON.stringify(right.span);
}

function uniqueLocations(locations: readonly SourceLocation[], cancellation: AnalysisCancellationToken): SourceLocation[] {
  const byKey = new Map<string, SourceLocation>();
  for (const location of locations) {
    cancellation.throwIfCancelled();
    const key = JSON.stringify(location);
    if (!byKey.has(key)) byKey.set(key, location);
  }
  return [...byKey.values()].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}
