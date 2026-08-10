import * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramElement,
  ProgramEvidenceGap,
  ProgramEvidenceLocation,
  ProgramProof,
  ProgramRelationKind,
} from "./program-evidence";
import { collectProgramEvidenceCarriers } from "./program-evidence-carrier";
import {
  type HttpBridgeFetch,
  type HttpBridgeResource,
  type HttpBridgeResponse,
} from "./http-bridge-evidence";
import { connectProgramHttpBridges, hydratedFactsForIds } from "./program-evidence-hydration";
import type { CompactProgramFact } from "./program-evidence-compact-facts";

type FunctionInfo = {
  id: string;
  name: string;
  declaration: TypeScript.FunctionLikeDeclaration;
};

type CallInfo = {
  node: TypeScript.CallExpression | TypeScript.NewExpression;
  id: string;
  target: FunctionInfo | null;
};

export type ProgramEvidenceTransportContext = {
  ts: typeof TypeScript;
  checker: TypeScript.TypeChecker;
  root: string;
  files: readonly TypeScript.SourceFile[];
  facts: readonly CompactProgramFact[];
  calls: readonly CallInfo[];
  handlers: readonly FunctionInfo[];
  parameters: ReadonlyMap<string, string>;
  fetches: readonly HttpBridgeFetch[];
  resources: readonly HttpBridgeResource[];
  responses: readonly HttpBridgeResponse[];
  checkCancellation: () => void;
  symbolId: (node: TypeScript.Node) => string | null;
  moduleFor: (node: TypeScript.Node) => string | null;
  elementFor: (node: TypeScript.Node, kind: string) => string | null;
  targetFunction: (node: TypeScript.Node) => FunctionInfo | null;
  functionForNode: (node: TypeScript.Node) => FunctionInfo | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  hydrateFact: (fact: CompactProgramFact) => ProgramElement;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
  reconcileGap: (fetchId: string) => void;
};

export function connectProgramEvidenceTransport(context: ProgramEvidenceTransportContext): void {
  collectProgramEvidenceCarriers({
    ts: context.ts,
    checker: context.checker,
    root: context.root,
    files: context.files,
    calls: context.calls,
    symbolId: context.symbolId,
    moduleFor: context.moduleFor,
    elementFor: context.elementFor,
    targetFunction: context.targetFunction,
    functionForNode: context.functionForNode,
    location: context.location,
    addRelation: context.addRelation,
  });
  connectProgramHttpBridges({
    checkCancellation: context.checkCancellation,
    root: context.root,
    ts: context.ts,
    checker: context.checker,
    elements: elementsForHttpBridges(context),
    fetches: context.fetches,
    calls: context.calls,
    handlers: context.handlers,
    resources: context.resources,
    responses: context.responses,
    requestParameterIds: context.parameters,
    symbolId: context.symbolId,
    location: context.location,
    addRelation: context.addRelation,
    reconcileGap: context.reconcileGap,
  });
}

export function reconcileProgramHttpBridgeGap(gaps: ProgramEvidenceGap[], fetchId: string): void {
  for (let index = gaps.length - 1; index >= 0; index -= 1) {
    const gap = gaps[index];
    if (gap.from === fetchId && gap.reason === "external-code" && gap.detail.startsWith("Static proof stops at the external response body;")) gaps.splice(index, 1);
  }
}

function elementsForHttpBridges(context: ProgramEvidenceTransportContext): ProgramElement[] {
  const ids = new Set<string>([
    ...context.calls.flatMap((call) => call.target ? [call.target.id] : []),
    ...context.handlers.map((handler) => handler.id),
    ...context.parameters.values(),
    ...context.fetches.map((fetch) => fetch.elementId),
    ...context.resources.map((resource) => resource.elementId),
    ...context.responses.map((response) => response.elementId),
    ...context.facts
      .filter((fact) => fact.kind === "handler-entry" || fact.kind === "resource-input" || fact.kind === "fetch-input" || fact.kind === "http-response")
      .map((fact) => fact.id),
  ]);
  return hydratedFactsForIds(context.facts, ids, context.hydrateFact);
}
