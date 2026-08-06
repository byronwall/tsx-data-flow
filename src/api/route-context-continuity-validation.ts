import type { RouteTotality } from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";
import { addIssue, indexIds, requireReference, validateReferenceList, type ValidationIssue } from "./route-occurrence-validation-graph";

type ContextContinuity = RouteTotality["contextContinuity"];

export function validateRouteContextContinuity(
  totality: RouteTotality,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] {
  cancellation.throwIfCancelled();
  const context = totality.contextContinuity;
  const issues: ValidationIssue[] = [];
  const surface = totality.occurrenceSurface;
  const surfaceUnavailable = surface.status === "unavailable";
  const declarations = indexIds(context.declarations, ["contextContinuity", "declarations"], (item) => item.id, issues, cancellation);
  const providers = indexIds(context.providers, ["contextContinuity", "providers"], (item) => item.id, issues, cancellation);
  const values = indexIds(context.values, ["contextContinuity", "values"], (item) => item.id, issues, cancellation);
  const reads = indexIds(context.reads, ["contextContinuity", "reads"], (item) => item.id, issues, cancellation);
  const consumers = indexIds(context.consumers, ["contextContinuity", "consumers"], (item) => item.id, issues, cancellation);
  indexIds(context.links, ["contextContinuity", "links"], (item) => item.id, issues, cancellation);
  indexIds(context.gaps, ["contextContinuity", "gaps"], (item) => item.id, issues, cancellation);
  validateSortedIds(context, issues);
  const expectedCounts = {
    declarations: context.declarations.length,
    providers: context.providers.length,
    values: context.values.length,
    reads: context.reads.length,
    consumers: context.consumers.length,
    links: context.links.length,
    gaps: context.gaps.length,
  };
  for (const key of Object.keys(expectedCounts) as Array<keyof typeof expectedCounts>) {
    if (context.counts[key] !== expectedCounts[key]) addIssue(issues, ["contextContinuity", "counts", key], "context count must match its serialized collection");
  }

  const declarationIds = new Set(declarations.keys());
  const providerIds = new Set(providers.keys());
  const valueIds = new Set(values.keys());
  const readIds = new Set(reads.keys());
  const consumerIds = new Set(consumers.keys());
  const occurrenceIds = surfaceUnavailable ? new Set<string>() : new Set(surface.occurrences.map((item) => item.id));
  const terminalIds = surfaceUnavailable ? new Set<string>() : new Set(surface.terminals.map((item) => item.id));

  context.declarations.forEach((declaration, index) => {
    cancellation.throwIfCancelled();
    requireReference(declaration.defaultValueId, valueIds, ["contextContinuity", "declarations", index, "defaultValueId"], "defaultValueId", issues);
    if (declaration.proof.length === 0) addIssue(issues, ["contextContinuity", "declarations", index, "proof"], "context declarations require source-backed proof");
    const defaultValue = declaration.defaultValueId ? context.values.find((value) => value.id === declaration.defaultValueId) : null;
    if (defaultValue && (defaultValue.sourceKind !== "default" || defaultValue.contextDeclarationId !== declaration.id)) addIssue(issues, ["contextContinuity", "declarations", index, "defaultValueId"], "defaultValueId must reference the same declaration's static default value");
  });

  context.values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    requireReference(value.contextDeclarationId, declarationIds, ["contextContinuity", "values", index, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(value.providerOccurrenceId, providerIds, ["contextContinuity", "values", index, "providerOccurrenceId"], "providerOccurrenceId", issues);
    if (value.sourceKind === "default" && value.providerOccurrenceId !== null) addIssue(issues, ["contextContinuity", "values", index, "providerOccurrenceId"], "default values cannot belong to Provider occurrences");
    if (value.sourceKind === "provider" && value.providerOccurrenceId === null) addIssue(issues, ["contextContinuity", "values", index, "providerOccurrenceId"], "Provider values require a Provider occurrence");
    if (value.memberNames.some((member, memberIndex) => value.memberNames.indexOf(member) !== memberIndex)) addIssue(issues, ["contextContinuity", "values", index, "memberNames"], "member names must be unique");
    if (value.sourceKind === "default") {
      const declaration = context.declarations.find((item) => item.id === value.contextDeclarationId);
      if (declaration && declaration.defaultValueId !== value.id) addIssue(issues, ["contextContinuity", "values", index, "id"], "static default value must be referenced by its declaration");
    }
  });

  context.providers.forEach((provider, index) => {
    cancellation.throwIfCancelled();
    requireReference(provider.contextDeclarationId, declarationIds, ["contextContinuity", "providers", index, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(provider.renderOccurrenceId, occurrenceIds, ["contextContinuity", "providers", index, "renderOccurrenceId"], "renderOccurrenceId", issues);
    requireReference(provider.valueId, valueIds, ["contextContinuity", "providers", index, "valueId"], "valueId", issues);
    const value = context.values.find((item) => item.id === provider.valueId);
    if (value && (value.providerOccurrenceId !== provider.id || value.contextDeclarationId !== provider.contextDeclarationId)) addIssue(issues, ["contextContinuity", "providers", index, "valueId"], "Provider value must point back to its exact Provider occurrence and context declaration");
    if (!surfaceUnavailable) {
      const occurrence = surface.occurrences.find((item) => item.id === provider.renderOccurrenceId);
      if (occurrence && (occurrence.ownership !== provider.ownership || occurrence.repetition !== provider.repetition)) addIssue(issues, ["contextContinuity", "providers", index], "Provider ownership and repetition must match its route render occurrence");
    }
  });

  context.reads.forEach((read, index) => {
    cancellation.throwIfCancelled();
    requireReference(read.contextDeclarationId, declarationIds, ["contextContinuity", "reads", index, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(read.consumerOccurrenceId, consumerIds, ["contextContinuity", "reads", index, "consumerOccurrenceId"], "consumerOccurrenceId", issues);
    const consumer = context.consumers.find((item) => item.id === read.consumerOccurrenceId);
    if (consumer && (consumer.contextDeclarationId !== read.contextDeclarationId || !consumer.readIds.includes(read.id))) addIssue(issues, ["contextContinuity", "reads", index], "context read must point to a consumer that owns the read");
  });

  context.consumers.forEach((consumer, index) => {
    cancellation.throwIfCancelled();
    requireReference(consumer.contextDeclarationId, declarationIds, ["contextContinuity", "consumers", index, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(consumer.renderOccurrenceId, occurrenceIds, ["contextContinuity", "consumers", index, "renderOccurrenceId"], "renderOccurrenceId", issues);
    validateReferenceList(consumer.readIds, readIds, ["contextContinuity", "consumers", index, "readIds"], "readId", issues, cancellation);
    validateReferenceList(consumer.terminalIds, terminalIds, ["contextContinuity", "consumers", index, "terminalIds"], "terminalId", issues, cancellation);
    if (!surfaceUnavailable) {
      const occurrence = surface.occurrences.find((item) => item.id === consumer.renderOccurrenceId);
      if (occurrence && occurrence.repetition !== consumer.repetition) addIssue(issues, ["contextContinuity", "consumers", index, "repetition"], "consumer repetition must match its route render occurrence");
      for (const terminalId of consumer.terminalIds) {
        const terminal = surface.terminals.find((item) => item.id === terminalId);
        if (terminal && (!terminal.ownerOccurrenceId || !isOwnedByOccurrence(surface, terminal.ownerOccurrenceId, consumer.renderOccurrenceId))) addIssue(issues, ["contextContinuity", "consumers", index, "terminalIds"], "consumer terminal must belong to the consumer occurrence or its owned render descendants");
      }
    }
  });

  context.links.forEach((link, index) => {
    cancellation.throwIfCancelled();
    const path = ["contextContinuity", "links", index] as Array<string | number>;
    requireReference(link.contextDeclarationId, declarationIds, [...path, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(link.providerOccurrenceId, providerIds, [...path, "providerOccurrenceId"], "providerOccurrenceId", issues);
    requireReference(link.providedValueId, valueIds, [...path, "providedValueId"], "providedValueId", issues);
    requireReference(link.readId, readIds, [...path, "readId"], "readId", issues);
    requireReference(link.consumerOccurrenceId, consumerIds, [...path, "consumerOccurrenceId"], "consumerOccurrenceId", issues);
    validateReferenceList(link.terminalIds, terminalIds, [...path, "terminalIds"], "terminalId", issues, cancellation);
    const provider = link.providerOccurrenceId ? context.providers.find((item) => item.id === link.providerOccurrenceId) : null;
    const value = context.values.find((item) => item.id === link.providedValueId);
    const read = context.reads.find((item) => item.id === link.readId);
    const consumer = context.consumers.find((item) => item.id === link.consumerOccurrenceId);
    if (link.sourceKind === "default" && link.providerOccurrenceId !== null) addIssue(issues, [...path, "providerOccurrenceId"], "default continuity cannot reference a Provider occurrence");
    if (link.sourceKind === "provider" && link.providerOccurrenceId === null) addIssue(issues, [...path, "providerOccurrenceId"], "Provider continuity requires a Provider occurrence");
    if (value && value.contextDeclarationId !== link.contextDeclarationId) addIssue(issues, [...path, "providedValueId"], "provided value context declaration does not match the continuity link");
    if (provider && provider.contextDeclarationId !== link.contextDeclarationId) addIssue(issues, [...path, "providerOccurrenceId"], "Provider context declaration does not match the continuity link");
    if (provider && value && value.contextDeclarationId !== provider.contextDeclarationId) addIssue(issues, [...path, "providedValueId"], "Provider and provided value context declarations must agree");
    if (value && value.providerOccurrenceId !== link.providerOccurrenceId) addIssue(issues, [...path, "providedValueId"], "Continuity must reference the exact value owned by its selected Provider occurrence");
    if (value && value.sourceKind !== link.sourceKind) addIssue(issues, [...path, "sourceKind"], "continuity source kind must match the provided value");
    if (read && (read.contextDeclarationId !== link.contextDeclarationId || read.consumerOccurrenceId !== link.consumerOccurrenceId)) addIssue(issues, [...path, "readId"], "continuity read does not match its context or consumer occurrence");
    if (consumer && consumer.contextDeclarationId !== link.contextDeclarationId) addIssue(issues, [...path, "consumerOccurrenceId"], "continuity consumer does not match its context declaration");
    if (provider && link.renderAncestry[0] !== provider.renderOccurrenceId) addIssue(issues, [...path, "renderAncestry"], "Provider continuity ancestry must start at the selected Provider owner occurrence");
    if (consumer && link.renderAncestry.at(-1) !== consumer.renderOccurrenceId) addIssue(issues, [...path, "renderAncestry"], "continuity ancestry must end at the consuming occurrence");
    if (provider && consumer && !surfaceUnavailable && JSON.stringify(link.renderAncestry) !== JSON.stringify(ancestryBetween(surface, provider.renderOccurrenceId, consumer.renderOccurrenceId))) addIssue(issues, [...path, "renderAncestry"], "continuity ancestry must match the route occurrence parent chain");
    if (!provider && consumer && !surfaceUnavailable && JSON.stringify(link.renderAncestry) !== JSON.stringify(ancestryBetween(surface, null, consumer.renderOccurrenceId))) addIssue(issues, [...path, "renderAncestry"], "default continuity ancestry must match the consumer route occurrence chain");
    if (link.sourceKind === "default" && link.nearestProvider) addIssue(issues, [...path, "nearestProvider"], "default continuity cannot claim a nearest Provider");
    if (link.sourceKind === "provider" && !link.nearestProvider) addIssue(issues, [...path, "nearestProvider"], "Provider continuity must identify the nearest Provider decision");
    if (read && (JSON.stringify(link.members) !== JSON.stringify(read.members) || link.memberCertainty !== read.memberCertainty)) addIssue(issues, [...path, "members"], "continuity member evidence must match its context read");
    if (consumer && link.terminalIds.some((terminalId) => !consumer.terminalIds.includes(terminalId))) addIssue(issues, [...path, "terminalIds"], "continuity terminal must be owned by its consumer occurrence record");
    if (link.status === "proven" && (read?.status !== "proven" || value?.status !== "proven" || provider?.status !== undefined && provider.status !== "proven" || link.memberCertainty !== "proven")) addIssue(issues, [...path, "status"], "proven context continuity requires proven read, value, Provider, and member evidence");
  });

  context.gaps.forEach((gap, index) => {
    cancellation.throwIfCancelled();
    requireReference(gap.contextDeclarationId, declarationIds, ["contextContinuity", "gaps", index, "contextDeclarationId"], "contextDeclarationId", issues);
    requireReference(gap.providerOccurrenceId, providerIds, ["contextContinuity", "gaps", index, "providerOccurrenceId"], "providerOccurrenceId", issues);
    requireReference(gap.readId, readIds, ["contextContinuity", "gaps", index, "readId"], "readId", issues);
    requireReference(gap.consumerOccurrenceId, consumerIds, ["contextContinuity", "gaps", index, "consumerOccurrenceId"], "consumerOccurrenceId", issues);
    if (gap.location !== null && gap.proof.length === 0) addIssue(issues, ["contextContinuity", "gaps", index, "proof"], "source-located context gaps require proof locations");
  });

  if (context.status === "complete" && context.gaps.length > 0) addIssue(issues, ["contextContinuity", "status"], "complete context continuity cannot contain gaps");
  if (context.status === "complete" && [...context.declarations, ...context.providers, ...context.values, ...context.reads, ...context.consumers, ...context.links].some((item) => item.status !== "proven")) addIssue(issues, ["contextContinuity", "status"], "complete context continuity requires proven context records");
  if (context.status === "unavailable" && (context.declarations.length > 0 || context.providers.length > 0 || context.values.length > 0 || context.reads.length > 0 || context.consumers.length > 0 || context.links.length > 0)) addIssue(issues, ["contextContinuity", "status"], "unavailable context continuity cannot contain route records");
  if (surfaceUnavailable && context.status !== "unavailable") addIssue(issues, ["contextContinuity", "status"], "unavailable occurrence surface requires unavailable context continuity");
  return issues;
}

function ancestryBetween(
  surface: Exclude<RouteTotality["occurrenceSurface"], { status: "unavailable" }>,
  ancestorId: string | null,
  descendantId: string,
): string[] {
  const byId = new Map(surface.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const reverse: string[] = [];
  let current: string | null = descendantId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    reverse.push(current);
    if (current === ancestorId) break;
    current = byId.get(current)?.parentOccurrenceId ?? null;
  }
  if (ancestorId !== null && reverse.at(-1) !== ancestorId) return [];
  return reverse.reverse();
}

function isOwnedByOccurrence(
  surface: Exclude<RouteTotality["occurrenceSurface"], { status: "unavailable" }>,
  ownerOccurrenceId: string | null,
  consumerOccurrenceId: string,
): boolean {
  if (!ownerOccurrenceId) return false;
  return ancestryBetween(surface, consumerOccurrenceId, ownerOccurrenceId).length > 0;
}

function validateSortedIds(context: ContextContinuity, issues: ValidationIssue[]): void {
  const collections: Array<[string, Array<{ id: string }>]> = [
    ["declarations", context.declarations],
    ["providers", context.providers],
    ["values", context.values],
    ["reads", context.reads],
    ["consumers", context.consumers],
    ["links", context.links],
    ["gaps", context.gaps],
  ];
  for (const [name, values] of collections) {
    for (let index = 1; index < values.length; index += 1) {
      if (values[index - 1].id.localeCompare(values[index].id) > 0) addIssue(issues, ["contextContinuity", name, index], "context records must be sorted by stable id");
    }
  }
}
