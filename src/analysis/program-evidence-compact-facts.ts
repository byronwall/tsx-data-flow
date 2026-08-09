import type {
  EvidenceConfidence,
  ProgramElement,
  ProgramElementKind,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProofKind,
} from "./program-evidence";
import type { ComponentBindingMetadata } from "./program-component-binding-metadata";

export type CompactFactAttributes = Readonly<Record<string, string | number | boolean | null>>;

/**
 * A source-backed fact that is sufficient for selection and relation replay.
 *
 * This deliberately excludes expression text, checker type text, imported
 * module text, and proof arrays. Those values are created only when a query
 * asks for the element.
 */
export type CompactProgramFact = {
  id: string;
  kind: ProgramElementKind;
  operationKind: ProgramOperationKind | null;
  label: string;
  location: CompactFactLocation;
  nodeStart: number;
  nodeEnd: number;
  nodeKind: number;
  symbolId: string | null;
  module: string | null;
  definitionId: string | null;
  ownerId: string | null;
  attributes: CompactFactAttributes;
  componentBinding?: ComponentBindingMetadata | null;
  confidence: EvidenceConfidence;
  proofKind: ProgramProofKind;
  proofDetail: string;
};

/** Compact location storage avoids the proof and element object graph. */
export type CompactFactLocation = {
  file: string;
  line: number;
  column: number;
  span: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
};

export function compactLocation(location: ProgramEvidenceLocation): CompactFactLocation {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: {
      startLine: location.span.startLine,
      startColumn: location.span.startColumn,
      endLine: location.span.endLine,
      endColumn: location.span.endColumn,
    },
  };
}

export function expandLocation(location: CompactFactLocation): ProgramEvidenceLocation {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: {
      startLine: location.span.startLine,
      startColumn: location.span.startColumn,
      endLine: location.span.endLine,
      endColumn: location.span.endColumn,
    },
  };
}

/** Convert an eager element to a compact index record for compatibility. */
export function compactFactFromElement(element: ProgramElement): CompactProgramFact {
  const proofValue = element.proof;
  const location = compactLocation(element.location);
  return {
    id: element.id,
    kind: element.kind as ProgramElementKind,
    operationKind: element.operationKind,
    label: element.label,
    location,
    nodeStart: 0,
    nodeEnd: 0,
    nodeKind: 0,
    symbolId: element.symbolId,
    module: element.module,
    definitionId: element.definitionId,
    ownerId: element.ownerId,
    attributes: { ...element.attributes },
    componentBinding: element.componentBinding,
    confidence: element.confidence,
    proofKind: (proofValue?.kind ?? "ast-node") as ProgramProofKind,
    proofDetail: proofValue?.detail ?? "The source element is part of the collected evidence.",
  };
}

/** Estimate the retained compact catalog without forcing JSON serialization. */
export function compactFactBytes(fact: CompactProgramFact): number {
  let bytes = 128;
  bytes += (fact.id.length + fact.label.length + (fact.symbolId?.length ?? 0)
    + (fact.definitionId?.length ?? 0) + (fact.ownerId?.length ?? 0)
    + fact.proofDetail.length) * 2;
  bytes += fact.location.file.length * 2;
  for (const [key, value] of Object.entries(fact.attributes)) {
    bytes += (key.length + String(value ?? "").length) * 2 + 16;
  }
  return bytes;
}
