import type * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramElement,
  ProgramEvidenceLocation,
  ProgramProof,
  ProgramRelationKind,
} from "./program-evidence";
import {
  expandLocation,
  type CompactProgramFact,
} from "./program-evidence-compact-facts";
import { proof, typeId } from "./program-evidence-support";
import {
  collectHttpBridgeEvidence,
  type HttpBridgeFetch,
  type HttpBridgeResource,
  type HttpBridgeResponse,
} from "./http-bridge-evidence";
import { componentBindingMetadataForElement } from "./program-component-binding-metadata";

export type ProgramEvidenceHydrationContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  filesByRelativeName: ReadonlyMap<string, TypeScript.SourceFile>;
};

export function hydrateProgramFact(
  context: ProgramEvidenceHydrationContext,
  fact: CompactProgramFact,
): ProgramElement {
  const node = findFactNode(context.ts, context.filesByRelativeName, fact);
  const location = expandLocation(fact.location);
  const expression =
    node?.getText(node.getSourceFile()).replace(/\s+/g, " ").trim() ?? null;
  return {
    id: fact.id,
    kind: fact.kind,
    operationKind: fact.operationKind,
    label: fact.label,
    expression,
    location,
    symbolId: fact.symbolId,
    typeId: node ? typeId(context.checker, node) : null,
    module: fact.module,
    definitionId: fact.definitionId,
    ownerId: fact.ownerId,
    attributes: { ...fact.attributes },
    componentBinding: fact.componentBinding
      ?? componentBindingMetadataForElement(fact.kind, fact.attributes),
    confidence: fact.confidence,
    proof: proof(fact.proofKind, fact.proofDetail, [location]),
  };
}

export function hydratedFactsForIds(
  facts: readonly CompactProgramFact[],
  ids: ReadonlySet<string>,
  hydrate: (fact: CompactProgramFact) => ProgramElement,
): ProgramElement[] {
  return facts.filter((fact) => ids.has(fact.id)).map(hydrate);
}

export function connectProgramHttpBridges(context: {
  checkCancellation: () => void;
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  elements: readonly ProgramElement[];
  fetches: readonly HttpBridgeFetch[];
  calls: readonly {
    node: TypeScript.CallExpression | TypeScript.NewExpression;
    target: {
      id: string;
      declaration: TypeScript.FunctionLikeDeclaration;
    } | null;
  }[];
  resources: readonly HttpBridgeResource[];
  responses: readonly HttpBridgeResponse[];
  requestParameterIds: ReadonlyMap<string, string>;
  symbolId: (node: TypeScript.Node) => string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
  reconcileGap: (fetchId: string) => void;
}): void {
  context.checkCancellation();
  const bridges = collectHttpBridgeEvidence(context);
  for (const bridge of bridges) {
    context.checkCancellation();
    context.addRelation(
      bridge.from,
      bridge.to,
      "http-bridge",
      bridge.locations,
      bridge.proof,
      "proven",
    );
    context.reconcileGap(bridge.clientFetchId);
  }
}

type ClearableMap = { clear: () => void };
type ClearableList = { length: number };

export type ProgramEvidenceTransientState = {
  maps: readonly ClearableMap[];
  lists: readonly ClearableList[];
};

export function releaseProgramEvidenceTransientState(state: ProgramEvidenceTransientState): void {
  for (const map of state.maps) map.clear();
  for (const list of state.lists) list.length = 0;
}

function findFactNode(
  ts: typeof TypeScript,
  filesByRelativeName: ReadonlyMap<string, TypeScript.SourceFile>,
  fact: CompactProgramFact,
): TypeScript.Node | undefined {
  if (fact.nodeStart < 0 || fact.nodeEnd <= fact.nodeStart) return undefined;
  const file = filesByRelativeName.get(fact.location.file);
  if (!file) return undefined;
  let match: TypeScript.Node | undefined;
  const visit = (node: TypeScript.Node) => {
    if (match || node.pos > fact.nodeStart || node.end < fact.nodeEnd) return;
    if (node.kind === fact.nodeKind && node.getStart(file) === fact.nodeStart && node.getEnd() === fact.nodeEnd) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return match;
}
