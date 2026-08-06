import type {
  EvidenceConfidence,
  ProgramProofKind,
  ProgramRelationKind,
} from "./program-evidence";

export type CompactRelationPosition = Readonly<{
  line: number;
  column: number;
}>;
/** A source location token that can be expanded without retaining AST objects. */
export type CompactRelationLocationToken = Readonly<{
  file: string;
  start: CompactRelationPosition;
  end: CompactRelationPosition;
}>;
export type CompactRelationProof = Readonly<{
  kind: ProgramProofKind;
  detail: string;
  locations: readonly CompactRelationLocationToken[];
}>;
export type CompactRelationDescriptorInput = {
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: readonly CompactRelationLocationToken[];
  proof: CompactRelationProof;
  confidence: EvidenceConfidence;
  sourceSequence: number;
  contributingFiles: readonly string[];
  producerFile: string | null;
};
/**
 * Compact relation data. `descriptorId` is the eventual current relation ID.
 * It intentionally excludes confidence and proof locations, matching the
 * current stable relation identity calculation.
 */
export type CompactRelationDescriptor = Readonly<
  CompactRelationDescriptorInput & { descriptorId: string }
>;
export type CompactRelationDirection = "forward" | "backward";

export type CompactRelationQuery = {
  elementId?: string;
  direction?: CompactRelationDirection | "both";
  from?: string;
  to?: string;
  producerFile?: string | null;
  contributingFile?: string;
};
/** Build a descriptor while retaining only compact scalar location data. */
export function createCompactRelationDescriptor(
  input: CompactRelationDescriptorInput,
): CompactRelationDescriptor {
  if (!input.from || !input.to || input.from === input.to) {
    throw new Error("A compact relation descriptor requires distinct endpoints.");
  }
  if (!Number.isInteger(input.sourceSequence) || input.sourceSequence < 0) {
    throw new Error("A compact relation descriptor requires a non-negative sequence.");
  }

  const evidence = freezeLocations(input.evidence);
  const proof = Object.freeze({
    kind: input.proof.kind,
    detail: input.proof.detail,
    locations: freezeLocations(input.proof.locations),
  });
  const contributingFiles = freezeFiles(input.contributingFiles);
  const descriptor = {
    from: input.from,
    to: input.to,
    kind: input.kind,
    evidence,
    proof,
    confidence: input.confidence,
    sourceSequence: input.sourceSequence,
    contributingFiles,
    producerFile: input.producerFile,
    descriptorId: compactRelationStableId(input.from, input.to, input.kind, evidence, proof),
  } satisfies CompactRelationDescriptor;
  return Object.freeze(descriptor);
}
/** Reproduce `stableId("program-relation", ...)` without expanded locations. */
export function compactRelationStableId(
  from: string,
  to: string,
  kind: ProgramRelationKind,
  evidence: readonly CompactRelationLocationToken[],
  proof: Pick<CompactRelationProof, "kind" | "detail">,
): string {
  const value = [
    from,
    to,
    kind,
    serializeLocations(evidence),
    proof.kind,
    proof.detail,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `program-relation:${(hash >>> 0).toString(36)}`;
}
/** Deterministic source order used by every index query. */
export function compareCompactRelationDescriptors(
  left: CompactRelationDescriptor,
  right: CompactRelationDescriptor,
): number {
  return left.sourceSequence - right.sourceSequence
    || compareStrings(left.descriptorId, right.descriptorId)
    || compareStrings(descriptorTieKey(left), descriptorTieKey(right));
}
/** Index compact descriptors without retaining AST or expanded evidence objects. */
export class CompactRelationIndex {
  private readonly descriptors = new Map<string, CompactRelationDescriptor>();
  private readonly byFrom = new Map<string, Set<string>>();
  private readonly byTo = new Map<string, Set<string>>();
  private readonly byProducerFile = new Map<string, Set<string>>();
  private readonly byContributingFile = new Map<string, Set<string>>();
  private readonly byDirection = new Map<
    CompactRelationDirection,
    Map<string, Set<string>>
  >([
    ["forward", new Map<string, Set<string>>()],
    ["backward", new Map<string, Set<string>>()],
  ]);

  constructor(descriptors: readonly CompactRelationDescriptorInput[] = []) {
    this.addMany(descriptors);
  }

  get size(): number {
    return this.descriptors.size;
  }

  add(input: CompactRelationDescriptorInput | CompactRelationDescriptor): CompactRelationDescriptor {
    const descriptor = isDescriptor(input)
      ? input
      : createCompactRelationDescriptor(input);
    const existing = this.descriptors.get(descriptor.descriptorId);
    if (existing && compareCompactRelationDescriptors(existing, descriptor) <= 0) {
      return existing;
    }
    if (existing) this.removeIndexes(existing);
    this.descriptors.set(descriptor.descriptorId, descriptor);
    this.addIndexes(descriptor);
    return descriptor;
  }

  addMany(inputs: readonly CompactRelationDescriptorInput[]): void {
    for (const input of inputs) this.add(input);
  }

  get(descriptorId: string): CompactRelationDescriptor | undefined {
    return this.descriptors.get(descriptorId);
  }

  has(descriptorId: string): boolean {
    return this.descriptors.has(descriptorId);
  }

  all(): readonly CompactRelationDescriptor[] {
    return [...this.descriptors.values()].sort(compareCompactRelationDescriptors);
  }

  query(query: CompactRelationQuery = {}): readonly CompactRelationDescriptor[] {
    let ids: Set<string> | null = null;
    if (query.elementId) {
      ids = this.idsForElement(query.elementId, query.direction ?? "both");
    }
    if (query.from) ids = intersect(ids, this.byFrom.get(query.from));
    if (query.to) ids = intersect(ids, this.byTo.get(query.to));
    if (query.producerFile !== undefined) {
      ids = intersect(ids, this.byProducerFile.get(fileKey(query.producerFile)));
    }
    if (query.contributingFile) ids = intersect(ids, this.byContributingFile.get(query.contributingFile));
    const candidates = ids ?? new Set(this.descriptors.keys());
    return [...candidates]
      .map((id) => this.descriptors.get(id))
      .filter((descriptor): descriptor is CompactRelationDescriptor => Boolean(descriptor))
      .sort(compareCompactRelationDescriptors);
  }

  private idsForElement(
    elementId: string,
    direction: CompactRelationDirection | "both",
  ): Set<string> {
    const values = new Set<string>();
    const add = (ids: Set<string> | undefined) => {
      for (const id of ids ?? []) values.add(id);
    };
    if (direction === "forward" || direction === "both") {
      add(this.byDirection.get("forward")?.get(elementId));
    }
    if (direction === "backward" || direction === "both") {
      add(this.byDirection.get("backward")?.get(elementId));
    }
    return values;
  }

  private addIndexes(descriptor: CompactRelationDescriptor): void {
    addToMap(this.byFrom, descriptor.from, descriptor.descriptorId);
    addToMap(this.byTo, descriptor.to, descriptor.descriptorId);
    addToMap(this.byDirection.get("forward")!, descriptor.from, descriptor.descriptorId);
    addToMap(this.byDirection.get("backward")!, descriptor.to, descriptor.descriptorId);
    addToMap(this.byProducerFile, fileKey(descriptor.producerFile), descriptor.descriptorId);
    for (const file of descriptor.contributingFiles) {
      addToMap(this.byContributingFile, file, descriptor.descriptorId);
    }
  }

  private removeIndexes(descriptor: CompactRelationDescriptor): void {
    removeFromMap(this.byFrom, descriptor.from, descriptor.descriptorId);
    removeFromMap(this.byTo, descriptor.to, descriptor.descriptorId);
    removeFromMap(this.byDirection.get("forward")!, descriptor.from, descriptor.descriptorId);
    removeFromMap(this.byDirection.get("backward")!, descriptor.to, descriptor.descriptorId);
    removeFromMap(this.byProducerFile, fileKey(descriptor.producerFile), descriptor.descriptorId);
    for (const file of descriptor.contributingFiles) {
      removeFromMap(this.byContributingFile, file, descriptor.descriptorId);
    }
  }
}

function isDescriptor(
  value: CompactRelationDescriptorInput | CompactRelationDescriptor,
): value is CompactRelationDescriptor {
  return "descriptorId" in value;
}

function freezeLocations(
  locations: readonly CompactRelationLocationToken[],
): readonly CompactRelationLocationToken[] {
  return Object.freeze(locations.map((location) => Object.freeze({
    file: location.file,
    start: Object.freeze({ ...location.start }),
    end: Object.freeze({ ...location.end }),
  })));
}

function freezeFiles(files: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  return Object.freeze(files.filter((file) => {
    if (!file || seen.has(file)) return false;
    seen.add(file);
    return true;
  }));
}

function serializeLocations(locations: readonly CompactRelationLocationToken[]): string {
  return `[${locations.map((location) => {
    const { start, end } = location;
    return `{column:${start.column},file:${location.file},line:${start.line},span:{endColumn:${end.column},endLine:${end.line},startColumn:${start.column},startLine:${start.line}}}`;
  }).join(",")}]`;
}

function descriptorTieKey(descriptor: CompactRelationDescriptor): string {
  return [
    descriptor.confidence,
    descriptor.producerFile ?? "",
    descriptor.contributingFiles.join("\u0000"),
    serializeLocations(descriptor.evidence),
    descriptor.proof.kind,
    descriptor.proof.detail,
    serializeLocations(descriptor.proof.locations),
  ].join("\u001f");
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fileKey(file: string | null): string {
  return file ?? "\u0000";
}

function addToMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function removeFromMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key);
  if (!values) return;
  values.delete(value);
  if (values.size === 0) map.delete(key);
}

function intersect(current: Set<string> | null, next: Set<string> | undefined): Set<string> | null {
  if (!next) return new Set<string>();
  if (!current) return new Set(next);
  return new Set([...current].filter((id) => next.has(id)));
}
