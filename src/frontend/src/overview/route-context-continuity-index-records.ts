import type { RouteTotality } from "../../../api/contracts";

export type RouteContextContinuity = RouteTotality["contextContinuity"];
export type ContextDeclaration = RouteContextContinuity["declarations"][number];
export type ContextProvider = RouteContextContinuity["providers"][number];
export type ContextValue = RouteContextContinuity["values"][number];
export type ContextRead = RouteContextContinuity["reads"][number];
export type ContextConsumer = RouteContextContinuity["consumers"][number];
export type ContextLink = RouteContextContinuity["links"][number];
export type ContextRelay = RouteContextContinuity["relays"][number];
export type ContextGap = RouteContextContinuity["gaps"][number];
export type ContextRecordStatus = ContextDeclaration["status"];
export type ContextDerivedStatus = ContextRecordStatus | "unavailable";

export type ContextDeclarationRecords = {
  declarationId: string;
  declaration: ContextDeclaration | null;
  providers: readonly ContextProvider[];
  values: readonly ContextValue[];
  reads: readonly ContextRead[];
  consumers: readonly ContextConsumer[];
  links: readonly ContextLink[];
  relays: readonly ContextRelay[];
  sourceRelays: readonly ContextRelay[];
  targetRelays: readonly ContextRelay[];
  gaps: readonly ContextGap[];
};

export type ContextRecordIndex = {
  declarationsById: ReadonlyMap<string, ContextDeclaration>;
  providersById: ReadonlyMap<string, ContextProvider>;
  valuesById: ReadonlyMap<string, ContextValue>;
  readsById: ReadonlyMap<string, ContextRead>;
  consumersById: ReadonlyMap<string, ContextConsumer>;
  linksById: ReadonlyMap<string, ContextLink>;
  relaysById: ReadonlyMap<string, ContextRelay>;
  gapsById: ReadonlyMap<string, ContextGap>;
  byDeclarationId: ReadonlyMap<string, ContextDeclarationRecords>;
  unassignedGaps: readonly ContextGap[];
};

export type ContextLinkReferences = {
  provider: ContextProvider | null;
  value: ContextValue | null;
  read: ContextRead | null;
  consumer: ContextConsumer | null;
};

export type ContextRelayReferences = {
  sourceDeclaration: ContextDeclaration | null;
  targetDeclaration: ContextDeclaration | null;
  sourceRead: ContextRead | null;
  sourceConsumer: ContextConsumer | null;
  targetProvider: ContextProvider | null;
  targetValue: ContextValue | null;
  targetRead: ContextRead | null;
  targetConsumer: ContextConsumer | null;
};

type MutableDeclarationRecords = {
  providers: ContextProvider[];
  values: ContextValue[];
  reads: ContextRead[];
  consumers: ContextConsumer[];
  links: ContextLink[];
  relays: Map<string, ContextRelay>;
  sourceRelays: ContextRelay[];
  targetRelays: ContextRelay[];
  gaps: ContextGap[];
};

type ProofedContextRecord = {
  status: ContextRecordStatus;
  proof: readonly { status: ContextRecordStatus }[];
};

export function buildContextRecordIndex(context: RouteContextContinuity): ContextRecordIndex {
  const declarations = sortedById(context.declarations);
  const providers = sortedById(context.providers);
  const values = sortedById(context.values);
  const reads = sortedById(context.reads);
  const consumers = sortedById(context.consumers);
  const links = sortedById(context.links);
  const relays = sortedById(context.relays);
  const gaps = sortedById(context.gaps);
  const declarationsById = indexById(declarations);
  const buckets = new Map<string, MutableDeclarationRecords>();

  for (const declaration of declarations) ensureBucket(buckets, declaration.id);
  for (const provider of providers) ensureBucket(buckets, provider.contextDeclarationId).providers.push(provider);
  for (const value of values) ensureBucket(buckets, value.contextDeclarationId).values.push(value);
  for (const read of reads) ensureBucket(buckets, read.contextDeclarationId).reads.push(read);
  for (const consumer of consumers) ensureBucket(buckets, consumer.contextDeclarationId).consumers.push(consumer);
  for (const link of links) ensureBucket(buckets, link.contextDeclarationId).links.push(link);
  for (const relay of relays) {
    const source = ensureBucket(buckets, relay.sourceContextDeclarationId);
    const target = ensureBucket(buckets, relay.targetContextDeclarationId);
    source.relays.set(relay.id, relay);
    target.relays.set(relay.id, relay);
    source.sourceRelays.push(relay);
    target.targetRelays.push(relay);
  }
  for (const gap of gaps) {
    if (gap.contextDeclarationId !== null) ensureBucket(buckets, gap.contextDeclarationId).gaps.push(gap);
  }

  const byDeclarationId = new Map<string, ContextDeclarationRecords>();
  for (const [declarationId, bucket] of [...buckets.entries()].sort(compareEntryIds)) {
    byDeclarationId.set(declarationId, Object.freeze({
      declarationId,
      declaration: declarationsById.get(declarationId) ?? null,
      providers: freezeContextArray(sortedById(bucket.providers)),
      values: freezeContextArray(sortedById(bucket.values)),
      reads: freezeContextArray(sortedById(bucket.reads)),
      consumers: freezeContextArray(sortedById(bucket.consumers)),
      links: freezeContextArray(sortedById(bucket.links)),
      relays: freezeContextArray(sortedById([...bucket.relays.values()])),
      sourceRelays: freezeContextArray(sortedById(bucket.sourceRelays)),
      targetRelays: freezeContextArray(sortedById(bucket.targetRelays)),
      gaps: freezeContextArray(sortedById(bucket.gaps)),
    }));
  }

  return Object.freeze({
    declarationsById,
    providersById: indexById(providers),
    valuesById: indexById(values),
    readsById: indexById(reads),
    consumersById: indexById(consumers),
    linksById: indexById(links),
    relaysById: indexById(relays),
    gapsById: indexById(gaps),
    byDeclarationId,
    unassignedGaps: freezeContextArray(gaps.filter((gap) => gap.contextDeclarationId === null)),
  });
}

export function contextRecordStatus(record: ProofedContextRecord): ContextDerivedStatus {
  const proofStatus = record.proof.reduce<ContextDerivedStatus>(
    (status, proof) => combineContextStatuses(status, proof.status),
    record.proof.length === 0 && record.status === "proven" ? "partial" : record.status,
  );
  return combineContextStatuses(record.status, proofStatus);
}

export function contextValueStatus(value: ContextValue): ContextDerivedStatus {
  return combineContextStatuses(
    contextRecordStatus(value),
    value.memberCertainty === "proven" ? "proven" : "partial",
    ...value.memberEvidence.map(contextRecordStatus),
  );
}

export function contextReadStatus(read: ContextRead): ContextDerivedStatus {
  return combineContextStatuses(
    contextRecordStatus(read),
    read.memberCertainty === "proven" ? "proven" : "partial",
  );
}

export function contextLinkStatus(
  link: ContextLink,
  references: ContextLinkReferences,
): ContextDerivedStatus {
  if (!references.value || !references.read || !references.consumer) return "unsupported";
  if (link.sourceKind === "provider" && !references.provider) return "unsupported";
  return combineContextStatuses(
    contextRecordStatus(link),
    references.provider ? contextRecordStatus(references.provider) : "proven",
    contextValueStatus(references.value),
    contextReadStatus(references.read),
    contextRecordStatus(references.consumer),
    link.memberCertainty === "proven" ? "proven" : "partial",
  );
}

export function contextRelayStatus(
  relay: ContextRelay,
  references: ContextRelayReferences,
): ContextDerivedStatus {
  const {
    sourceDeclaration,
    targetDeclaration,
    sourceRead,
    sourceConsumer,
    targetProvider,
    targetValue,
    targetRead,
    targetConsumer,
  } = references;
  if (!sourceDeclaration || !targetDeclaration || !sourceRead || !sourceConsumer
    || !targetProvider || !targetValue || !targetRead || !targetConsumer) return "unsupported";
  return combineContextStatuses(
    contextRecordStatus(relay),
    contextRecordStatus(sourceDeclaration),
    contextRecordStatus(targetDeclaration),
    contextReadStatus(sourceRead),
    contextRecordStatus(sourceConsumer),
    contextRecordStatus(targetProvider),
    contextValueStatus(targetValue),
    contextReadStatus(targetRead),
    contextRecordStatus(targetConsumer),
    relay.gaps.length === 0 ? "proven" : "partial",
  );
}

export function combineContextStatuses(...statuses: readonly ContextDerivedStatus[]): ContextDerivedStatus {
  return statuses.reduce<ContextDerivedStatus>((current, candidate) => (
    statusRank(candidate) > statusRank(current) ? candidate : current
  ), "proven");
}

export function compareContextIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function freezeContextArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function ensureBucket(
  buckets: Map<string, MutableDeclarationRecords>,
  declarationId: string,
): MutableDeclarationRecords {
  const existing = buckets.get(declarationId);
  if (existing) return existing;
  const created: MutableDeclarationRecords = {
    providers: [],
    values: [],
    reads: [],
    consumers: [],
    links: [],
    relays: new Map(),
    sourceRelays: [],
    targetRelays: [],
    gaps: [],
  };
  buckets.set(declarationId, created);
  return created;
}

function indexById<T extends { id: string }>(records: readonly T[]): ReadonlyMap<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

function sortedById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => compareContextIds(left.id, right.id));
}

function compareEntryIds(
  left: readonly [string, MutableDeclarationRecords],
  right: readonly [string, MutableDeclarationRecords],
): number {
  return compareContextIds(left[0], right[0]);
}

function statusRank(status: ContextDerivedStatus): number {
  if (status === "proven") return 0;
  if (status === "partial") return 1;
  if (status === "unsupported") return 2;
  return 3;
}
