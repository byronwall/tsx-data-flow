import type {
  ProgramElement as IndexedProgramElement,
  ProgramProof,
  ProgramRelation as IndexedProgramRelation,
} from "./program-evidence";
import type {
  BoundaryKind,
  EvidenceGap,
  EvidenceProof,
  EvidenceStatus,
  OriginRole,
  ProgramElement,
  ProgramRelation,
  SourceLocation,
  TerminalRole,
} from "./scope-seam";
import { indexReadMetadataFromElement } from "./program-index-read-metadata";

export function records<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value instanceof Map) return [...value.values()] as T[];
  if (value && typeof value === "object") return Object.values(value) as T[];
  return [];
}

/** Guard the collector shape before converting records to the scope contract. */
export function isIndexedElement(value: unknown): value is IndexedProgramElement {
  const candidate = asRecord(value);
  return typeof candidate.id === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.label === "string"
    && isLocation(candidate.location)
    && isProof(candidate.proof)
    && Boolean(candidate.attributes && typeof candidate.attributes === "object")
    && (candidate.confidence === "proven" || candidate.confidence === "partial");
}

/** Guard the collector relation shape before converting records to the scope contract. */
export function isIndexedRelation(value: unknown): value is IndexedProgramRelation {
  const candidate = asRecord(value);
  return typeof candidate.id === "string"
    && typeof candidate.from === "string"
    && typeof candidate.to === "string"
    && typeof candidate.kind === "string"
    && isProof(candidate.proof)
    && (candidate.confidence === "proven" || candidate.confidence === "partial");
}

function isLocation(value: unknown): value is IndexedProgramElement["location"] {
  const candidate = asRecord(value);
  return typeof candidate.file === "string"
    && typeof candidate.line === "number"
    && typeof candidate.column === "number"
    && isSpan(candidate.span);
}

function isSpan(value: unknown): boolean {
  const candidate = asRecord(value);
  return ["startLine", "startColumn", "endLine", "endColumn"]
    .every((key) => typeof candidate[key] === "number");
}

function isProof(value: unknown): value is ProgramProof {
  const candidate = asRecord(value);
  return typeof candidate.kind === "string"
    && typeof candidate.detail === "string"
    && Array.isArray(candidate.locations)
    && candidate.locations.every(isLocation);
}

export function toSliceElement(element: IndexedProgramElement): ProgramElement {
  const status = element.confidence;
  return {
    id: element.id,
    kind: element.kind,
    fieldName: element.kind === "field-read" && element.operationKind === "field-read" && typeof element.attributes.property === "string"
      ? element.attributes.property
      : null,
    operationKind: element.operationKind,
    index: indexReadMetadataFromElement(element),
    label: element.label,
    source: sourceIdentityFor(element.location),
    location: toSliceLocation(element.location),
    status,
    proof: [toSliceProof(element.proof, status)],
    symbol: element.symbolId,
    originRoles: originRolesFor(element),
    terminalRoles: terminalRolesFor(element),
    boundary: boundaryFor(element),
  };
}

export function toSliceRelation(relation: IndexedProgramRelation): ProgramRelation {
  return {
    id: relation.id,
    from: relation.from,
    to: relation.to,
    kind: relation.kind,
    status: relation.confidence,
    proof: toSliceProof(relation.proof, relation.confidence),
  };
}

function toSliceProof(proof: ProgramProof, status: EvidenceStatus): EvidenceProof {
  return {
    kind: proof.kind,
    detail: proof.detail,
    locations: proof.locations.map(toSliceLocation),
    status,
  };
}

export function toSliceLocation(location: IndexedProgramElement["location"]): SourceLocation {
  return {
    file: location.file,
    line: location.line,
    column: location.column,
    span: location.span,
  };
}

function sourceIdentityFor(location: IndexedProgramElement["location"]) {
  return {
    file: location.file,
    start: sourceOffset(location.span.startLine, location.span.startColumn),
    end: sourceOffset(location.span.endLine, location.span.endColumn),
  };
}

function sourceOffset(line: number, column: number) {
  return line * 1_000_000 + column;
}

function originRolesFor(element: IndexedProgramElement): OriginRole[] {
  switch (element.kind) {
    case "parameter":
      if (element.attributes.originRole === "request" || element.attributes.originRole === "event") {
        return [element.attributes.originRole];
      }
      switch (element.attributes.name) {
        case "argv":
          return ["argument"];
        case "env":
          return ["environment"];
        case "cwd":
          return ["working-directory"];
        default:
          return [];
      }
    case "environment-input":
      return ["environment"];
    case "process-input":
      return String(element.attributes.name ?? "").includes("stdin")
        ? ["stdin"]
        : ["argument"];
    case "file-input":
      return ["filesystem"];
    case "fetch-input":
      return ["fetch", "network"];
    case "resource-input":
      return ["resource"];
    case "external-read":
      return ["external-read"];
    default:
      return [];
  }
}

function terminalRolesFor(element: IndexedProgramElement): TerminalRole[] {
  switch (element.kind) {
    case "render-terminal":
    case "dom-terminal":
      return ["render"];
    case "stdout":
      return isStderrExpression(element) ? ["side-effect"] : ["stdout"];
    case "stderr":
      return ["side-effect"];
    case "exit-status":
      return ["exit"];
    case "file-write":
      return ["file-write"];
    case "http-response":
      return ["http-response"];
    case "message":
      return ["message"];
    case "return":
      if (element.attributes.terminalRole === "http-response") return ["http-response"];
      if (element.attributes.terminalRole === "response") return ["response", "return"];
      return element.attributes.terminalRole === "return" ? ["return"] : [];
    case "external-effect":
    case "network-request":
      return ["side-effect"];
    case "component-occurrence":
      return ["component-occurrence"];
    default:
      return [];
  }
}

function boundaryFor(element: IndexedProgramElement): BoundaryKind | null {
  switch (element.kind) {
    case "file-input":
    case "file-write":
      return "filesystem";
    case "fetch-input":
    case "network-request":
    case "http-response":
      return "network";
    case "external-read":
    case "message":
      return "external-code";
    case "environment-input":
    case "process-input":
    case "stdout":
    case "stderr":
    case "exit-status":
      return "process";
    case "resource-input":
    case "resource-result":
      return "framework-runtime";
    case "external-effect":
      return "external-code";
    default:
      return null;
  }
}

function isStderrExpression(element: IndexedProgramElement) {
  const sourceText = `${element.expression ?? ""} ${element.label}`;
  return /\bprocess\.stderr\.write\b/.test(sourceText);
}

export function scopeGapReason(reason: string): EvidenceGap["reason"] {
  if (
    reason === "unsupported-syntax"
    || reason === "dynamic-dispatch"
    || reason === "external-code"
    || reason === "identity-lost"
    || reason === "unresolved-symbol"
    || reason === "runtime-only"
    || reason === "disconnected"
    || reason === "unsupported-boundary"
    || reason === "ambiguous-target"
    || reason === "unproven-handoff"
    || reason === "budget-exhausted"
  ) {
    return reason;
  }
  return "unresolved-symbol";
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
