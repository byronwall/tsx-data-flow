import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type {
  ContextContinuityGap,
  ContextContinuityLink,
  ContextConsumerOccurrenceRecord,
  ContextProvidedValueRecord,
  ContextReadRecord,
} from "./context-continuity";
import type { RouteOccurrenceSurface, RouteRenderOccurrence } from "./route-occurrence-surface";
import type { SourceLocation } from "./scope-seam";
import {
  contextReadShape,
  functionName,
  locationForContextNode,
  locationKey,
  nearestFunctionLike,
  type SolidContextDeclaration,
} from "./solid-route-context-continuity-support";
import {
  ancestryFor,
  compareProof,
  memberStatusFor,
  mergeStatus,
  nearestProviders,
  proof,
  stableId,
  terminalIdsForRead,
} from "./solid-route-context-continuity-route-support";
import type { ContextDeclarationBuild, ProviderSite } from "./solid-route-context-continuity-record-support";

export type ContextReadSyntax = {
  context: SolidContextDeclaration;
  call: TypeScript.CallExpression;
  underlyingCalls: TypeScript.CallExpression[];
  wrapper: boolean;
};

export type ContextReadSite = {
  syntax: ContextReadSyntax;
  host: RouteRenderOccurrence;
  read: ContextReadRecord;
  consumer: ContextConsumerOccurrenceRecord;
  terminalIds: string[];
  terminalLocations: SourceLocation[];
};

export type UnresolvedProviderSite = {
  host: RouteRenderOccurrence;
  openingLocation: SourceLocation;
  elementLocation: SourceLocation;
};

type AddGap = (gap: Omit<ContextContinuityGap, "id">) => void;

export function buildContextReadsAndLinks(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  surface: RouteOccurrenceSurface,
  readSyntaxes: readonly ContextReadSyntax[],
  declarations: readonly ContextDeclarationBuild[],
  providers: readonly ProviderSite[],
  unresolvedProviders: readonly UnresolvedProviderSite[],
  cancellation: AnalysisCancellationToken,
  occurrencesForNode: (node: TypeScript.Node) => RouteRenderOccurrence[],
  providerReachesConsumer: (provider: ProviderSite, consumerId: string) => boolean,
  unresolvedProviderReachesConsumer: (provider: UnresolvedProviderSite, consumerId: string) => boolean,
  unsupportedBoundaryForProvider: (provider: ProviderSite, consumerId: string) => SourceLocation | null,
  addGap: AddGap,
): { reads: ContextReadRecord[]; consumers: ContextConsumerOccurrenceRecord[]; links: ContextContinuityLink[] } {
  const declarationByCompilerIdentity = new Map(declarations.map((item) => [item.syntax.compilerIdentity, item]));
  const reads: ContextReadRecord[] = [];
  const consumersById = new Map<string, ContextConsumerOccurrenceRecord>();
  const readSites: ContextReadSite[] = [];
  const orderedReads = [...readSyntaxes].sort((left, right) => locationKey(locationForContextNode(root, left.call)).localeCompare(locationKey(locationForContextNode(root, right.call))));
  for (const syntax of orderedReads) {
    cancellation.throwIfCancelled();
    const declaration = declarationByCompilerIdentity.get(syntax.context.compilerIdentity);
    if (!declaration) continue;
    const contextId = declaration.record.id;
    const hosts = occurrencesForNode(syntax.call);
    if (hosts.length === 0) {
      const wrapper = nearestFunctionLike(ts, syntax.call);
      const wrapperName = wrapper ? functionName(ts, wrapper) : null;
      addGap({
        reason: wrapperName?.startsWith("use") ? "unsupported-wrapper" : "ambiguous-ownership",
        label: wrapperName?.startsWith("use")
          ? `Context read ${syntax.call.expression.getText(syntax.call.getSourceFile())} is inside an unsupported first-party wrapper.`
          : "Context read has no compiler-proven consuming component occurrence.",
        location: locationForContextNode(root, syntax.call),
        contextDeclarationId: contextId,
        providerOccurrenceId: null,
        readId: null,
        consumerOccurrenceId: null,
        status: "unsupported",
        proof: proof("parent-occurrence", "The route occurrence tree cannot assign this read to one consuming component occurrence.", [locationForContextNode(root, syntax.call)], "unsupported"),
      });
      continue;
    }
    for (const host of hosts) {
      const consumerId = stableId("context-consumer", [contextId, host.id]);
      const readId = stableId("context-read", [contextId, host.id, locationKey(locationForContextNode(root, syntax.call))]);
      const shape = contextReadShape(ts, checker, syntax.call);
      const readStatus = shape.memberCertainty === "unknown" ? "partial" : "proven";
      const read: ContextReadRecord = {
        id: readId,
        contextDeclarationId: contextId,
        consumerOccurrenceId: consumerId,
        expression: syntax.call.getText(syntax.call.getSourceFile()),
        location: locationForContextNode(root, syntax.call),
        members: shape.members,
        memberPaths: shape.memberPaths,
        memberCertainty: shape.memberCertainty,
        status: readStatus,
        proof: proof(
          syntax.wrapper ? "return-expression" : "compiler-symbol",
          syntax.wrapper
            ? "A first-party wrapper returns the compiler-resolved Solid useContext result."
            : "The call is the canonical Solid useContext read for this compiler-identified context.",
          [locationForContextNode(root, syntax.call), ...syntax.underlyingCalls.map((call) => locationForContextNode(root, call))],
          readStatus,
        ),
      };
      const terminalData = terminalIdsForRead(ts, checker, surface, root, syntax.call, host.id);
      const consumer = consumersById.get(consumerId) ?? {
        id: consumerId,
        contextDeclarationId: contextId,
        renderOccurrenceId: host.id,
        readIds: [],
        terminalIds: [],
        repetition: host.repetition,
        location: host.callSite,
        status: readStatus,
        proof: proof("parent-occurrence", `The context read belongs to consuming component occurrence ${host.id}.`, [host.callSite], readStatus),
      };
      consumer.readIds.push(readId);
      consumer.terminalIds = [...new Set([...consumer.terminalIds, ...terminalData.ids])].sort();
      consumer.status = mergeStatus(consumer.status, readStatus);
      consumer.proof = [...consumer.proof, ...read.proof].sort(compareProof);
      consumersById.set(consumerId, consumer);
      reads.push(read);
      readSites.push({ syntax, host, read, consumer, terminalIds: terminalData.ids, terminalLocations: terminalData.locations });
    }
  }

  const links: ContextContinuityLink[] = [];
  for (const site of readSites) {
    cancellation.throwIfCancelled();
    const declaration = declarationByCompilerIdentity.get(site.syntax.context.compilerIdentity);
    if (!declaration) continue;
    const unresolvedProvider = unresolvedProviders
      .filter((provider) => unresolvedProviderReachesConsumer(provider, site.host.id))
      .sort((left, right) => left.openingLocation.file.localeCompare(right.openingLocation.file) || left.openingLocation.span.startLine - right.openingLocation.span.startLine || left.openingLocation.span.startColumn - right.openingLocation.span.startColumn || left.host.id.localeCompare(right.host.id))[0];
    if (unresolvedProvider) {
      addUnresolvedProviderGap(addGap, site, unresolvedProvider);
      continue;
    }
    const sameContextProviders = providers.filter((provider) => provider.context.compilerIdentity === site.syntax.context.compilerIdentity);
    const reachableProviders = sameContextProviders.filter((provider) => providerReachesConsumer(provider, site.host.id));
    const boundaryProviders = sameContextProviders.filter((provider) => unsupportedBoundaryForProvider(provider, site.host.id) !== null);
    if (reachableProviders.length === 0) {
      const nearestBoundaryProviders = nearestProviders(boundaryProviders, site.host.id, surface);
      const boundaryProvider = nearestBoundaryProviders[0] ?? [...boundaryProviders].sort((left, right) => left.occurrence.id.localeCompare(right.occurrence.id))[0];
      if (boundaryProvider) {
        const boundaryLocation = unsupportedBoundaryForProvider(boundaryProvider, site.host.id);
        if (boundaryLocation) addBoundaryGap(addGap, site, boundaryProvider, boundaryLocation);
        continue;
      }
      if (declaration.defaultValue) {
        const memberStatus = memberStatusFor(site.read, declaration.defaultValue);
        if (memberStatus === "unsupported") addMemberGap(addGap, site, declaration.defaultValue);
        else links.push(defaultLink(surface, site, declaration.defaultValue));
      } else {
        addGap({
          reason: "missing-provider",
          label: `No Provider occurrence reaches context consumer ${site.consumer.id}, and no statically proven createContext default exists.`,
          location: site.read.location,
          contextDeclarationId: declaration.record.id,
          providerOccurrenceId: null,
          readId: site.read.id,
          consumerOccurrenceId: site.consumer.id,
          status: "partial",
          proof: proof("parent-occurrence", "The route occurrence tree contains no reachable Provider for this consumer occurrence.", [site.read.location, site.host.callSite], "partial"),
        });
      }
      continue;
    }
    const nearest = nearestProviders(reachableProviders, site.host.id, surface);
    if (nearest.length !== 1) {
      addGap({
        reason: "ambiguous-provider",
        label: `Multiple reachable Provider occurrences remain equally near context consumer ${site.consumer.id}.`,
        location: site.read.location,
        contextDeclarationId: declaration.record.id,
        providerOccurrenceId: null,
        readId: site.read.id,
        consumerOccurrenceId: site.consumer.id,
        status: "unsupported",
        proof: proof("parent-occurrence", "Provider selection stopped because route occurrence ancestry cannot prove one nearest Provider.", [site.read.location, ...nearest.map((provider) => provider.occurrence.location)], "unsupported"),
      });
      continue;
    }
    const provider = nearest[0];
    const boundaryLocation = unsupportedBoundaryForProvider(provider, site.host.id);
    if (boundaryLocation) {
      addBoundaryGap(addGap, site, provider, boundaryLocation);
      continue;
    }
    if (provider.occurrence.status === "unsupported" || provider.value.status === "unsupported") {
      addProviderBarrierGap(addGap, site, provider);
      continue;
    }
    const memberStatus = memberStatusFor(site.read, provider.value);
    if (memberStatus === "unsupported") {
      addMemberGap(addGap, site, provider.value);
      continue;
    }
    const ancestry = ancestryFor(surface, provider.host.id, site.host.id);
    const status = mergeStatus(mergeStatus(provider.occurrence.status, site.read.status), memberStatus === "partial" || provider.value.status === "partial" ? "partial" : "proven");
    links.push({
      id: stableId("context-continuity", [declaration.record.id, provider.occurrence.id, site.read.id]),
      contextDeclarationId: declaration.record.id,
      providerOccurrenceId: provider.occurrence.id,
      providedValueId: provider.value.id,
      readId: site.read.id,
      consumerOccurrenceId: site.consumer.id,
      terminalIds: site.terminalIds,
      members: site.read.members,
      memberPaths: site.read.memberPaths,
      memberCertainty: site.read.memberCertainty,
      sourceKind: "provider",
      renderAncestry: ancestry,
      nearestProvider: true,
      repetition: site.consumer.repetition,
      status,
      proof: proof("context-provider-reachability", `The route occurrence tree selects Provider ${provider.occurrence.id} as the nearest reachable Provider for consumer ${site.consumer.id}.`, [provider.occurrence.location, provider.value.location, site.read.location, site.consumer.location, ...site.terminalLocations], status),
    });
  }
  return { reads, consumers: [...consumersById.values()], links };
}

function defaultLink(surface: RouteOccurrenceSurface, site: ContextReadSite, value: ContextProvidedValueRecord): ContextContinuityLink {
  const status = mergeStatus(site.read.status, memberStatusFor(site.read, value) === "partial" ? "partial" : "proven");
  return {
    id: stableId("context-continuity-default", [value.id, site.read.id]),
    contextDeclarationId: value.contextDeclarationId,
    providerOccurrenceId: null,
    providedValueId: value.id,
    readId: site.read.id,
    consumerOccurrenceId: site.consumer.id,
    terminalIds: site.terminalIds,
    members: site.read.members,
    memberPaths: site.read.memberPaths,
    memberCertainty: site.read.memberCertainty,
    sourceKind: "default",
    renderAncestry: ancestryFor(surface, null, site.host.id),
    nearestProvider: false,
    repetition: site.consumer.repetition,
    status,
    proof: proof("context-default", "No same-context Provider occurrence reaches this consumer occurrence, so the statically proven createContext default is the explicit source.", [value.location, site.read.location, site.consumer.location, ...site.terminalLocations], status),
  };
}

function addMemberGap(addGap: AddGap, site: ContextReadSite, value: ContextProvidedValueRecord): void {
  addGap({
    reason: "unproven-member-identity",
    label: `Context member identity is not proven between value ${value.id} and read ${site.read.id}.`,
    location: site.read.location,
    contextDeclarationId: value.contextDeclarationId,
    providerOccurrenceId: value.providerOccurrenceId,
    readId: site.read.id,
    consumerOccurrenceId: site.consumer.id,
    status: "partial",
    proof: proof("property-access", "The context read or provided value has dynamic or incomplete member evidence.", [value.location, site.read.location], "partial"),
  });
}

function addProviderBarrierGap(addGap: AddGap, site: ContextReadSite, provider: ProviderSite): void {
  const status = provider.occurrence.status === "unsupported" || provider.value.status === "unsupported" ? "unsupported" : "partial";
  addGap({
    reason: "unsupported-syntax",
    label: `Nearest Provider occurrence ${provider.occurrence.id} is not fully proven; outer Providers are shadowed for consumer ${site.consumer.id}.`,
    location: provider.occurrence.location,
    contextDeclarationId: provider.occurrence.contextDeclarationId,
    providerOccurrenceId: provider.occurrence.id,
    readId: site.read.id,
    consumerOccurrenceId: site.consumer.id,
    status,
    proof: proof(
      "context-provider-reachability",
      "The nearest same-context Provider occurrence is retained as a shadowing barrier even though its identity, value, or ownership is incomplete.",
      [provider.occurrence.location, provider.value.location, site.read.location, site.consumer.location],
      status,
    ),
  });
}

function addBoundaryGap(addGap: AddGap, site: ContextReadSite, provider: ProviderSite, boundaryLocation: SourceLocation): void {
  addGap({
    reason: "unsupported-syntax",
    label: `Context continuity from Provider occurrence ${provider.occurrence.id} stops at an unsupported render boundary before consumer ${site.consumer.id}.`,
    location: boundaryLocation,
    contextDeclarationId: provider.occurrence.contextDeclarationId,
    providerOccurrenceId: provider.occurrence.id,
    readId: site.read.id,
    consumerOccurrenceId: site.consumer.id,
    status: "unsupported",
    proof: proof(
      "framework-boundary",
      "A Portal or unsupported ownership boundary lies between the Provider occurrence and its consuming component occurrence.",
      [provider.occurrence.location, boundaryLocation, site.read.location, site.consumer.location],
      "unsupported",
    ),
  });
}

function addUnresolvedProviderGap(addGap: AddGap, site: ContextReadSite, provider: UnresolvedProviderSite): void {
  addGap({
    reason: "dynamic-provider-identity",
    label: `Unresolved Provider identity in ${provider.openingLocation.file}:${provider.openingLocation.span.startLine} blocks context continuity for consumer ${site.consumer.id}.`,
    location: provider.openingLocation,
    contextDeclarationId: site.read.contextDeclarationId,
    providerOccurrenceId: null,
    readId: site.read.id,
    consumerOccurrenceId: site.consumer.id,
    status: "unsupported",
    proof: proof(
      "compiler-symbol",
      "The Provider identity cannot be compiler-resolved, so no Provider context identity is assigned and continuity cannot cross this render branch.",
      [provider.openingLocation, provider.elementLocation, site.read.location, site.consumer.location],
      "unsupported",
    ),
  });
}
