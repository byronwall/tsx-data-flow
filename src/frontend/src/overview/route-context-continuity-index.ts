import type { RouteTotality } from "../../../api/contracts";
import type { RouteTotalityDisplayLayout, RouteTotalityDisplayLayoutNode } from "./route-totality-display-layout";
import type { RouteTotalityLayout } from "./route-totality-model";
import { classifyContextDensity, type ContextDensity } from "./route-context-continuity-density";
import {
  buildContextRecordIndex,
  combineContextStatuses,
  compareContextIds,
  contextLinkStatus,
  contextRecordStatus,
  contextRelayStatus,
  freezeContextArray,
  type ContextConsumer,
  type ContextDeclaration,
  type ContextDeclarationRecords,
  type ContextDerivedStatus,
  type ContextGap,
  type ContextLink,
  type ContextProvider,
  type ContextRead,
  type ContextRelay,
  type ContextValue,
} from "./route-context-continuity-index-records";

export type ContextStatusFilter = "all" | "proven" | "partial" | "unsupported" | "gaps";
export type ContextRole = "provider" | "consumer";
export type ContextLinkMapping =
  | "mapped"
  | "default-value"
  | "missing-provider-record"
  | "unmapped-provider-node"
  | "missing-consumer-record"
  | "unmapped-consumer-node";

export type ContextNodeEndpoint = {
  nodeId: string;
  x: number;
  y: number;
  radius: number;
};

export type ContextNodeMark = {
  id: string;
  contextId: string;
  colorIndex: number;
  role: ContextRole;
  status: ContextDerivedStatus;
  occurrenceId: string;
  endpoint: ContextNodeEndpoint;
  slot: number;
  slotCount: number;
};

export type ContextVisualLink = {
  id: string;
  contextId: string;
  colorIndex: number;
  link: ContextLink;
  status: ContextDerivedStatus;
  mapping: ContextLinkMapping;
  provider: ContextProvider | null;
  value: ContextValue | null;
  read: ContextRead | null;
  consumer: ContextConsumer | null;
  from: ContextNodeEndpoint | null;
  to: ContextNodeEndpoint | null;
};

export type ContextVisualRelay = {
  id: string;
  contextId: string;
  colorIndex: number;
  relay: ContextRelay;
  status: ContextDerivedStatus;
  from: ContextNodeEndpoint | null;
  to: ContextNodeEndpoint | null;
  pathLabel: string;
};

export type ContextVisualRecord = {
  id: string;
  declaration: ContextDeclaration | null;
  records: ContextDeclarationRecords;
  label: string;
  status: ContextDerivedStatus;
  density: ContextDensity;
  colorIndex: number;
  providers: readonly ContextProvider[];
  consumers: readonly ContextConsumer[];
  links: readonly ContextVisualLink[];
  relays: readonly ContextVisualRelay[];
  gaps: readonly ContextGap[];
  marks: readonly ContextNodeMark[];
  mappedProviderCount: number;
  mappedConsumerCount: number;
};

export type RouteContextContinuityIndex = {
  status: RouteTotality["contextContinuity"]["status"];
  records: readonly ContextVisualRecord[];
  recordsById: ReadonlyMap<string, ContextVisualRecord>;
  unassignedGaps: readonly ContextGap[];
  counts: RouteTotality["contextContinuity"]["counts"];
};

export function buildRouteContextContinuityIndex(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  displayLayout: RouteTotalityDisplayLayout,
): RouteContextContinuityIndex {
  const context = totality?.contextContinuity;
  if (!context) return emptyContextIndex();
  const records = buildContextRecordIndex(context);
  const nodesById = new Map(
    [...displayLayout.nodes, ...displayLayout.evidenceNodes].map((node) => [node.id, node]),
  );
  const visuals = [...records.byDeclarationId.values()]
    .map((record) => visualRecord(
      record,
      records,
      new Set(record.providers.map((provider) => `occurrence:${provider.renderOccurrenceId}`)),
      layout.nodeRedirects,
      nodesById,
    ))
    .sort((left, right) => compareContextIds(left.id, right.id));
  assignMarkSlots(visuals.flatMap((record) => [...record.marks]));
  return Object.freeze({
    status: context.status,
    records: freezeContextArray(visuals),
    recordsById: new Map(visuals.map((record) => [record.id, record])),
    unassignedGaps: records.unassignedGaps,
    counts: context.counts,
  });
}

export function contextMatchesFilter(
  record: ContextVisualRecord,
  filter: ContextStatusFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "gaps") return record.gaps.length > 0;
  return record.status === filter;
}

export function contextStatusLabel(status: ContextDerivedStatus): string {
  if (status === "proven") return "Proven";
  if (status === "partial") return "Partial";
  if (status === "unsupported") return "Unsupported";
  return "Unavailable";
}

export function contextStatusSymbol(status: ContextDerivedStatus): string {
  if (status === "proven") return "✓";
  if (status === "partial") return "◐";
  if (status === "unsupported") return "!";
  return "–";
}

export function contextLinkMappingMessage(link: ContextVisualLink): string | null {
  if (link.mapping === "mapped") return null;
  if (link.mapping === "default-value") {
    return "This read uses the context default. No Provider occurrence exists for this link.";
  }
  if (link.mapping === "missing-provider-record") {
    return "The link names a Provider, but its Provider record is missing.";
  }
  if (link.mapping === "unmapped-provider-node") {
    return "The Provider exists, but its route occurrence is not mapped to a visible node.";
  }
  if (link.mapping === "missing-consumer-record") {
    return "The link names a consumer, but its consumer record is missing.";
  }
  return "The consumer exists, but its route occurrence is not mapped to a visible node.";
}

export function isRenderableContextLink(link: ContextVisualLink): boolean {
  return link.mapping === "mapped"
    && link.provider !== null
    && link.consumer !== null
    && link.from !== null
    && link.to !== null;
}

function visualRecord(
  records: ContextDeclarationRecords,
  index: ReturnType<typeof buildContextRecordIndex>,
  providerRenderOccurrences: ReadonlySet<string>,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextVisualRecord {
  const colorIndex = stableColorIndex(records.declarationId);
  const providerEndpoints = new Map(records.providers.map((provider) => [
    provider.id,
    endpointForRecordOccurrence(provider.renderOccurrenceId, provider.location, redirects, nodesById),
  ]));
  const consumerEndpoints = new Map(records.consumers.map((consumer) => [
    consumer.id,
    endpointForRecordOccurrence(consumer.renderOccurrenceId, consumer.location, redirects, nodesById),
  ]));
  const links = records.links.map((link) => visualLink(
    link,
    index,
    colorIndex,
    providerEndpoints,
    consumerEndpoints,
    providerRenderOccurrences,
    redirects,
    nodesById,
  ));
  const relays = records.relays.map((relay) => visualRelay(
    relay,
    index,
    records.declarationId,
    colorIndex,
    redirects,
    nodesById,
  ));
  const marks = [
    ...records.providers.flatMap((provider) => {
      const endpoint = providerEndpoints.get(provider.id) ?? null;
      return endpoint ? [nodeMark(records.declarationId, colorIndex, "provider", provider.id, contextRecordStatus(provider), endpoint)] : [];
    }),
    ...records.consumers.flatMap((consumer) => {
      const endpoint = consumerEndpoints.get(consumer.id) ?? null;
      return endpoint ? [nodeMark(records.declarationId, colorIndex, "consumer", consumer.id, contextRecordStatus(consumer), endpoint)] : [];
    }),
  ].sort((left, right) => compareContextIds(left.id, right.id));
  const status = recordStatus(records, links, relays);
  return Object.freeze({
    id: records.declarationId,
    declaration: records.declaration,
    records,
    label: records.declaration?.label ?? `Unknown context ${records.declarationId}`,
    status,
    density: classifyContextDensity({ consumers: records.consumers.length, providers: records.providers.length }),
    colorIndex,
    providers: records.providers,
    consumers: records.consumers,
    links: freezeContextArray(links),
    relays: freezeContextArray(relays),
    gaps: records.gaps,
    marks: freezeContextArray(marks),
    mappedProviderCount: [...providerEndpoints.values()].filter(Boolean).length,
    mappedConsumerCount: [...consumerEndpoints.values()].filter(Boolean).length,
  });
}

function visualLink(
  link: ContextLink,
  index: ReturnType<typeof buildContextRecordIndex>,
  colorIndex: number,
  providerEndpoints: ReadonlyMap<string, ContextNodeEndpoint | null>,
  consumerEndpoints: ReadonlyMap<string, ContextNodeEndpoint | null>,
  providerRenderOccurrences: ReadonlySet<string>,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextVisualLink {
  const provider = link.providerOccurrenceId ? index.providersById.get(link.providerOccurrenceId) ?? null : null;
  const value = index.valuesById.get(link.providedValueId) ?? null;
  const read = index.readsById.get(link.readId) ?? null;
  const consumer = index.consumersById.get(link.consumerOccurrenceId) ?? null;
  const from = provider
    ? linkSourceEndpoint(
      link,
      provider,
      consumer,
      providerEndpoints,
      providerRenderOccurrences,
      redirects,
      nodesById,
    )
    : null;
  const to = consumer ? consumerEndpoints.get(consumer.id) ?? null : null;
  return Object.freeze({
    id: link.id,
    contextId: link.contextDeclarationId,
    colorIndex,
    link,
    status: contextLinkStatus(link, { provider, value, read, consumer }),
    mapping: linkMapping(link, provider, consumer, from, to),
    provider,
    value,
    read,
    consumer,
    from,
    to,
  });
}

function linkSourceEndpoint(
  link: ContextLink,
  provider: ContextProvider,
  consumer: ContextConsumer | null,
  providerEndpoints: ReadonlyMap<string, ContextNodeEndpoint | null>,
  providerRenderOccurrences: ReadonlySet<string>,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextNodeEndpoint | null {
  const mapped = providerEndpoints.get(provider.id) ?? null;
  if (!consumer) return mapped;
  if (link.sourceKind !== "provider" || provider.ownership !== "definition-owned") return mapped;
  if (link.renderAncestry.length !== 2) return mapped;
  if (link.renderAncestry[0] !== provider.renderOccurrenceId) return mapped;
  if (link.renderAncestry[1] !== consumer.renderOccurrenceId) return mapped;
  const mappedAnchorIsKnownProvider = mapped?.nodeId && mapped.nodeId.startsWith("occurrence:")
    && providerRenderOccurrences.has(mapped.nodeId)
    && mapped.nodeId !== `occurrence:${provider.renderOccurrenceId}`;
  if (mappedAnchorIsKnownProvider) return mapped;
  return endpointForOccurrence(provider.renderOccurrenceId, redirects, nodesById) ?? mapped;
}

function visualRelay(
  relay: ContextRelay,
  index: ReturnType<typeof buildContextRecordIndex>,
  contextId: string,
  colorIndex: number,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextVisualRelay {
  const references = {
    sourceDeclaration: index.declarationsById.get(relay.sourceContextDeclarationId) ?? null,
    targetDeclaration: index.declarationsById.get(relay.targetContextDeclarationId) ?? null,
    sourceRead: index.readsById.get(relay.sourceReadId) ?? null,
    sourceConsumer: index.consumersById.get(relay.sourceConsumerOccurrenceId) ?? null,
    targetProvider: index.providersById.get(relay.targetProviderOccurrenceId) ?? null,
    targetValue: index.valuesById.get(relay.targetProvidedValueId) ?? null,
    targetRead: index.readsById.get(relay.targetReadId) ?? null,
    targetConsumer: index.consumersById.get(relay.targetConsumerOccurrenceId) ?? null,
  };
  return Object.freeze({
    id: relay.id,
    contextId,
    colorIndex,
    relay,
    status: contextRelayStatus(relay, references),
    from: references.sourceConsumer
      ? endpointForOccurrence(references.sourceConsumer.renderOccurrenceId, redirects, nodesById)
      : null,
    to: references.targetProvider
      ? endpointForOccurrence(references.targetProvider.renderOccurrenceId, redirects, nodesById)
      : null,
    pathLabel: `${memberPath(relay.sourceMemberPath)} → ${memberPath(relay.factoryMemberPath)} → ${memberPath(relay.targetMemberPath)}`,
  });
}

function recordStatus(
  records: ContextDeclarationRecords,
  links: readonly ContextVisualLink[],
  relays: readonly ContextVisualRelay[],
): ContextDerivedStatus {
  if (!records.declaration) return "unsupported";
  return combineContextStatuses(
    contextRecordStatus(records.declaration),
    ...records.providers.map(contextRecordStatus),
    ...records.consumers.map(contextRecordStatus),
    ...links.map((link) => link.status),
    ...relays.map((relay) => relay.status),
    ...records.gaps.map((gap) => gap.status),
  );
}

function linkMapping(
  link: ContextLink,
  provider: ContextProvider | null,
  consumer: ContextConsumer | null,
  from: ContextNodeEndpoint | null,
  to: ContextNodeEndpoint | null,
): ContextLinkMapping {
  if (link.sourceKind === "default") return "default-value";
  if (!provider) return "missing-provider-record";
  if (!from) return "unmapped-provider-node";
  if (!consumer) return "missing-consumer-record";
  if (!to) return "unmapped-consumer-node";
  return "mapped";
}

function endpointForOccurrence(
  occurrenceId: string,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextNodeEndpoint | null {
  let nodeId = `occurrence:${occurrenceId}`;
  const visited = new Set<string>();
  while (redirects.has(nodeId) && !visited.has(nodeId)) {
    visited.add(nodeId);
    nodeId = redirects.get(nodeId)!;
  }
  const node = nodesById.get(nodeId);
  return node ? Object.freeze({
    nodeId,
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
    radius: node.radius,
  }) : null;
}

function endpointForRecordOccurrence(
  occurrenceId: string,
  recordLocation: RouteTotalityDisplayLayoutNode["node"]["location"] | null,
  redirects: ReadonlyMap<string, string>,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextNodeEndpoint | null {
  const mapped = endpointForOccurrence(occurrenceId, redirects, nodesById);
  if (!recordLocation) return mapped;
  const mappedNode = mapped ? nodesById.get(mapped.nodeId) : null;
  if (mappedNode?.node?.location && isSameLocation(mappedNode.node.location, recordLocation)) return mapped;
  return endpointForLocation(recordLocation, nodesById) ?? mapped;
}

function endpointForLocation(
  location: RouteTotalityDisplayLayoutNode["node"]["location"] | null,
  nodesById: ReadonlyMap<string, RouteTotalityDisplayLayoutNode>,
): ContextNodeEndpoint | null {
  const node = [...nodesById.values()].find((candidate) => candidate.node?.location && isSameLocation(candidate.node.location, location));
  if (!node) return null;
  return Object.freeze({
    nodeId: node.id,
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
    radius: node.radius,
  });
}

function isSameLocation(
  left: RouteTotalityDisplayLayoutNode["node"]["location"] | null,
  right: RouteTotalityDisplayLayoutNode["node"]["location"] | null,
): boolean {
  if (!left || !right) return false;
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}

function nodeMark(
  contextId: string,
  colorIndex: number,
  role: ContextRole,
  occurrenceId: string,
  status: ContextDerivedStatus,
  endpoint: ContextNodeEndpoint,
): ContextNodeMark {
  return {
    id: `${contextId}:${role}:${occurrenceId}`,
    contextId,
    colorIndex,
    role,
    status,
    occurrenceId,
    endpoint,
    slot: 0,
    slotCount: 1,
  };
}

function assignMarkSlots(marks: ContextNodeMark[]): void {
  const byNode = new Map<string, ContextNodeMark[]>();
  for (const mark of marks) byNode.set(mark.endpoint.nodeId, [...(byNode.get(mark.endpoint.nodeId) ?? []), mark]);
  for (const nodeMarks of byNode.values()) {
    nodeMarks.sort((left, right) => compareContextIds(left.id, right.id));
    nodeMarks.forEach((mark, slot) => {
      mark.slot = slot;
      mark.slotCount = nodeMarks.length;
    });
  }
}

function stableColorIndex(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash * 31) + id.charCodeAt(index)) >>> 0;
  return hash % 6;
}

function memberPath(path: readonly string[]): string {
  return path.join(".");
}

function emptyContextIndex(): RouteContextContinuityIndex {
  return Object.freeze({
    status: "unavailable",
    records: Object.freeze([]),
    recordsById: new Map(),
    unassignedGaps: Object.freeze([]),
    counts: Object.freeze({ declarations: 0, providers: 0, values: 0, reads: 0, consumers: 0, links: 0, relays: 0, gaps: 0 }),
  });
}
