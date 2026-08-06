import path from "node:path";
import {
  collectProgramEvidenceForRoot,
  type ProgramEvidence,
} from "../program-evidence";
import {
  boundaryPolicy,
  scopeCandidateId,
  scopePolicy,
  scopeSeedFor,
  type EvidenceProof,
  type ScopeCandidate,
  type ScopeSeed,
} from "../scope-seam";
import {
  discoverServerlessHandlers,
  sourceIdentityForElement,
  type EvidenceElement,
} from "./serverless-handler-support";

type ScopeEvidence = {
  elements: readonly EvidenceElement[];
  relations: readonly unknown[];
};

/** Discover a factory-created handler from exact source relationships. */
export function discoverServerlessHandlerCandidates(
  root: string,
  evidence: ScopeEvidence,
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = [];
  const seenEntryIds = new Set<string>();
  for (const discovery of discoverServerlessHandlers(root, evidence.elements)) {
    if (seenEntryIds.has(discovery.entry.id)) continue;
    seenEntryIds.add(discovery.entry.id);
    const proof: EvidenceProof[] = [
      {
        kind: "serverless-handler-factory",
        detail: `${discovery.factoryName} returns the nested ${discovery.handlerName} function in ${discovery.factoryLocation.file}.`,
        locations: [discovery.factoryLocation, discovery.entry.location],
        status: "proven",
      },
      {
        kind: "serverless-handler-assignment",
        detail: `${discovery.assignmentName} is assigned from the ${discovery.factoryName} call in ${discovery.assignmentLocation.file}.`,
        locations: [discovery.assignmentLocation, discovery.callLocation],
        status: "proven",
      },
      {
        kind: "serverless-handler-parameters",
        detail: `${discovery.handlerName} declares event and context parameters in ${discovery.eventLocation.file}.`,
        locations: [discovery.entry.location, discovery.eventLocation, discovery.contextLocation],
        status: "proven",
      },
    ];
    candidates.push({
      id: scopeCandidateId("serverless-handler", sourceIdentityForElement(discovery.entry)),
      kind: "handler",
      adapter: "serverless-handler",
      label: discovery.assignmentName,
      entryElementId: discovery.entry.id,
      entry: discovery.entry.location,
      framework: null,
      proof,
      defaults: scopePolicy({
        direction: "forward",
        boundaryPolicy: boundaryPolicy({ maxElements: 512, maxRelations: 1024 }),
      }),
    });
  }
  return candidates;
}

/** Convert a serverless handler candidate into the shared slice seed. */
export function buildServerlessHandlerSeed(candidate: ScopeCandidate): ScopeSeed {
  return scopeSeedFor(candidate);
}

export type EvidenceSliceAdapterInput = {
  evidence: ProgramEvidence;
  seeds: ScopeSeed[];
};

export async function loadServerlessHandlerEvidence(
  fixtureRoot: string,
): Promise<EvidenceSliceAdapterInput> {
  const root = path.resolve(fixtureRoot);
  const evidence = await collectProgramEvidenceForRoot(root);
  const candidates = discoverServerlessHandlerCandidates(root, evidence);
  return { evidence, seeds: candidates.map(buildServerlessHandlerSeed) };
}

export const evidenceSliceAdapter = {
  name: "serverless-handler",
  load: loadServerlessHandlerEvidence,
};
