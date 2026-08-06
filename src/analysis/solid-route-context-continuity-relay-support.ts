import * as TypeScript from "typescript";
import type { ProgramValueMember } from "./program-value-summary-types";
import type {
  ContextContinuityRelay,
  ContextContinuityLink,
  ContextConsumerOccurrenceRecord,
  ContextReadRecord,
} from "./context-continuity";
import type { RouteOccurrenceSurface, RouteRenderOccurrence } from "./route-occurrence-surface";
import type { SourceLocation } from "./scope-seam";
import {
  contextDeclarationForExpression,
  contextWrapperForCall,
  locationForContextNode,
  locationKey,
  type SolidContextDeclaration,
} from "./solid-route-context-continuity-support";
import {
  contextDeclarationId,
  ancestryFor,
  proof,
  stableId,
  uniqueLocations,
} from "./solid-route-context-continuity-route-support";
import type { ContextReadSyntax } from "./solid-route-context-continuity-read-support";
import type { ProviderSite } from "./solid-route-context-continuity-record-support";

type RelaySource = {
  provider: ProviderSite;
  member: ProgramValueMember;
  sourceCall: TypeScript.CallExpression;
  sourceContext: SolidContextDeclaration;
};

export function collectRelayReadSyntaxes(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  unownedReadSyntaxes: readonly ContextReadSyntax[],
  providers: readonly ProviderSite[],
): ContextReadSyntax[] {
  const sourceCalls = relaySources(ts, checker, root, providers).map((source) => source.sourceCall);
  return unownedReadSyntaxes
    .filter((syntax) => sourceCalls.some((call) => sameNode(call, syntax.call)))
    .sort((left, right) => locationKey(locationForContextNode(root, left.call)).localeCompare(locationKey(locationForContextNode(root, right.call))));
}

export function collectRelayReadOwners(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  providers: readonly ProviderSite[],
): Map<string, RouteRenderOccurrence[]> {
  const owners = new Map<string, RouteRenderOccurrence[]>();
  for (const source of relaySources(ts, checker, root, providers)) {
    const key = nodeKey(source.sourceCall);
    const current = owners.get(key) ?? [];
    if (!current.some((host) => host.id === source.provider.host.id)) current.push(source.provider.host);
    owners.set(key, current.sort((left, right) => left.id.localeCompare(right.id)));
  }
  return owners;
}

export function buildContextRelays(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  providers: readonly ProviderSite[],
  reads: readonly ContextReadRecord[],
  consumers: readonly ContextConsumerOccurrenceRecord[],
  links: readonly ContextContinuityLink[],
  surface: RouteOccurrenceSurface,
): ContextContinuityRelay[] {
  const consumerById = new Map(consumers.map((consumer) => [consumer.id, consumer]));
  const relays: ContextContinuityRelay[] = [];
  for (const source of relaySources(ts, checker, root, providers)) {
    const sourceContextId = contextDeclarationId(source.sourceContext);
    const sourceRead = reads.find((read) =>
      read.contextDeclarationId === sourceContextId
      && sameLocation(read.location, locationForContextNode(root, source.sourceCall))
      && read.consumerOccurrenceId === consumerIdFor(sourceContextId, source.provider.host.id),
    );
    if (!sourceRead || source.member.status !== "proven" || source.member.sources.length !== 1) continue;
    const targetContextId = source.provider.value.contextDeclarationId;
    const factoryMemberPath = [...source.member.memberPath];
    const targetReadCandidates = reads
      .filter((read) => read.contextDeclarationId === targetContextId)
      .filter((read) => read.memberPaths.some((path) => isPathPrefix(factoryMemberPath, path) || samePath(factoryMemberPath, path)))
      .filter((read) => isDescendant(surface, source.provider.host.id, consumerById.get(read.consumerOccurrenceId)?.renderOccurrenceId ?? null))
      .sort((left, right) => compareTargetReads(left, right));
    const targetRead = targetReadCandidates[0];
    if (!targetRead) continue;
    const targetConsumer = consumerById.get(targetRead.consumerOccurrenceId);
    if (!targetConsumer || !source.provider.factoryCall) continue;
    const factoryLocation = locationForContextNode(root, source.provider.factoryCall);
    const targetMemberPath = [...targetRead.memberPaths.sort(comparePaths).find((path) => isPathPrefix(factoryMemberPath, path) || samePath(factoryMemberPath, path)) ?? factoryMemberPath];
    const targetLink = links.find((link) => link.readId === targetRead.id && link.providedValueId === source.provider.value.id);
    const sourceMemberPath = sourceRead.memberPaths[0] ? [...sourceRead.memberPaths[0]] : [...factoryMemberPath];
    const status = relayStatus(source, sourceRead, targetRead, targetLink);
    const proofLocations = [
      sourceRead.location,
      source.provider.value.location,
      source.provider.occurrence.location,
      factoryLocation,
      targetRead.location,
      targetConsumer.location,
    ];
    const relay: ContextContinuityRelay = {
      id: stableId("context-relay", [
        sourceContextId,
        targetContextId,
        sourceRead.id,
        source.provider.occurrence.id,
        source.provider.value.id,
        targetRead.id,
        sourceMemberPath.join("."),
        targetMemberPath.join("."),
      ]),
      sourceContextDeclarationId: sourceContextId,
      targetContextDeclarationId: targetContextId,
      sourceReadId: sourceRead.id,
      sourceConsumerOccurrenceId: sourceRead.consumerOccurrenceId,
      sourceMemberPath,
      sourceReadMemberPaths: sourceRead.memberPaths.map((path) => [...path]),
      factoryMemberPath,
      factoryCallExpression: source.provider.factoryCall.getText(source.provider.factoryCall.getSourceFile()),
      factoryCallLocation: factoryLocation,
      factoryCallTargetId: source.provider.valueSummary?.callTarget?.id ?? null,
      targetProviderOccurrenceId: source.provider.occurrence.id,
      targetProvidedValueId: source.provider.value.id,
      targetReadId: targetRead.id,
      targetConsumerOccurrenceId: targetConsumer.id,
      targetMemberPath,
      status,
      gaps: status === "proven" ? [] : relayGaps(source, sourceRead, targetRead, targetLink),
      proof: proof(
        "context-relay",
        `The exact returned member ${factoryMemberPath.join(".")} carries one source context read into target context ${targetContextId} and reaches member ${targetMemberPath.join(".")}.`,
        uniqueLocations(proofLocations),
        status,
      ),
    };
    relays.push(relay);
  }
  return [...new Map(relays.map((relay) => [relay.id, relay])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function relaySources(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  providers: readonly ProviderSite[],
): RelaySource[] {
  const sources: RelaySource[] = [];
  for (const provider of providers) {
    const summary = provider.valueSummary;
    if (!summary || !provider.factoryCall) continue;
    for (const member of summary.members) {
      if (member.status !== "proven" || member.sources.length !== 1) continue;
      const resolved = member.sources[0].resolvedSourceExpression?.node;
      if (!resolved || !ts.isCallExpression(resolved)) continue;
      const context = contextForSourceCall(ts, checker, root, resolved);
      if (!context) continue;
      sources.push({ provider, member, sourceCall: resolved, sourceContext: context });
    }
  }
  return sources;
}

function contextForSourceCall(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  call: TypeScript.CallExpression,
): SolidContextDeclaration | null {
  const wrapper = contextWrapperForCall(ts, checker, root, call);
  if (wrapper && wrapper !== "unsupported") return wrapper.context;
  if (wrapper === "unsupported") return null;
  if (call.arguments.length === 1 && ts.isCallExpression(call) && call.expression && call.expression.getText(call.getSourceFile()) === "useContext") return contextDeclarationForExpression(ts, checker, root, call.arguments[0]);
  return null;
}

function relayStatus(
  source: RelaySource,
  sourceRead: ContextReadRecord,
  targetRead: ContextReadRecord,
  targetLink: ContextContinuityLink | undefined,
): "proven" | "partial" | "unsupported" {
  if (sourceRead.status !== "proven" || source.member.status !== "proven") return "partial";
  if (targetRead.status !== "proven") return "partial";
  if (targetLink?.status === "unsupported") return "unsupported";
  return "proven";
}

function relayGaps(
  source: RelaySource,
  sourceRead: ContextReadRecord,
  targetRead: ContextReadRecord,
  targetLink: ContextContinuityLink | undefined,
): string[] {
  const gaps: string[] = [];
  if (sourceRead.status !== "proven") gaps.push("source-read-partial");
  if (source.member.status !== "proven") gaps.push("factory-member-partial");
  if (targetRead.status !== "proven") gaps.push("target-read-partial");
  if (targetLink?.status === "unsupported") gaps.push("target-context-link-unsupported");
  return gaps;
}

function compareTargetReads(left: ContextReadRecord, right: ContextReadRecord): number {
  const leftDepth = Math.max(...left.memberPaths.map((path) => path.length), 0);
  const rightDepth = Math.max(...right.memberPaths.map((path) => path.length), 0);
  return rightDepth - leftDepth || left.id.localeCompare(right.id);
}

function isDescendant(surface: RouteOccurrenceSurface, ancestorId: string, descendantId: string | null): boolean {
  return Boolean(descendantId && ancestryFor(surface, ancestorId, descendantId).length > 1);
}

function consumerIdFor(contextId: string, occurrenceId: string): string {
  return stableId("context-consumer", [contextId, occurrenceId]);
}

function sameLocation(left: SourceLocation, right: SourceLocation): boolean {
  return locationKey(left) === locationKey(right);
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function isPathPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length < path.length && prefix.every((part, index) => part === path[index]);
}

function comparePaths(left: readonly string[], right: readonly string[]): number {
  return left.join(".").localeCompare(right.join("."));
}

function sameNode(left: TypeScript.Node, right: TypeScript.Node): boolean {
  return left.getSourceFile().fileName === right.getSourceFile().fileName
    && left.getStart(left.getSourceFile()) === right.getStart(right.getSourceFile())
    && left.getEnd() === right.getEnd();
}

function nodeKey(node: TypeScript.Node): string {
  const file = node.getSourceFile();
  return `${file.fileName}:${node.getStart(file)}:${node.getEnd()}`;
}
