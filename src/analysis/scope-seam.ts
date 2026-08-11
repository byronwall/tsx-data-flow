/**
 * Scope-neutral evidence contracts.
 *
 * Program identities use only source coordinates and a semantic kind. A route
 * or adapter can select a scope, but it cannot change the identity of a
 * program element or relation.
 */

import type { ComponentBindingMetadata } from "./program-component-binding-metadata";

export type EvidenceStatus = "proven" | "partial" | "unsupported";

export type SourceSpan = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SourceLocation = {
  file: string;
  line: number;
  column: number;
  span: SourceSpan;
};

export type SourceIdentity = {
  file: string;
  start: number;
  end: number;
};

export type EvidenceProof = {
  kind: string;
  detail: string;
  locations: SourceLocation[];
  status: EvidenceStatus;
};

export type ProgramElement = {
  /** Stable source identity. This must never contain a scope or route ID. */
  id: string;
  kind: string;
  /** Exact compiler-backed name for a static named field read. */
  fieldName: string | null;
  /** Exact compiler operation classification when one exists. */
  operationKind: string | null;
  /** Narrow raw metadata for an element-access expression. */
  index: ProgramIndexReadMetadata | null;
  label: string;
  source: SourceIdentity;
  location: SourceLocation;
  status: EvidenceStatus;
  proof: EvidenceProof[];
  symbol: string | null;
  /** Exact compiler import module when the element resolves through one. */
  module?: string | null;
  componentBinding: ComponentBindingMetadata | null;
  ownerId?: string | null;
  attributes?: Record<string, string | number | boolean | null>;
  originRoles: OriginRole[];
  terminalRoles: TerminalRole[];
  boundary: BoundaryKind | null;
};

export type ProgramIndexReadMetadata =
  | { kind: "string-literal"; value: string }
  | { kind: "numeric-literal"; value: string }
  | { kind: "dynamic"; value: null };

export type ProgramRelation = {
  /** Stable identity derived from source-backed endpoints and relation proof. */
  id: string;
  from: string;
  to: string;
  kind: string;
  status: EvidenceStatus;
  proof: EvidenceProof;
};

export type BoundaryKind =
  | "external-code"
  | "framework-runtime"
  | "filesystem"
  | "network"
  | "process"
  | "unknown";

export type OriginRole =
  | "argument"
  | "environment"
  | "working-directory"
  | "stdin"
  | "request"
  | "event"
  | "filesystem"
  | "fetch"
  | "resource"
  | "network"
  | "external-read"
  | "input-boundary";

export type TerminalRole =
  | "render"
  | "component-occurrence"
  | "stdout"
  | "file-write"
  | "exit"
  | "side-effect"
  | "return"
  | "http-response"
  | "response"
  | "message"
  | "child-process"
  | "completion";

export type ScopeKind = "route" | "command" | "handler" | "module" | "function" | string;

export type SliceDirection = "forward" | "backward" | "both";

/** Alias used by adapters that describe the direction before issuing a query. */
export type ScopeDirection = SliceDirection;

export type BoundaryPolicy = {
  maxDepth: number;
  maxElements: number;
  maxRelations: number;
  includeExternal: boolean;
  includeUnsupported: boolean;
  includeFramework: boolean;
  stopAtBoundary: boolean;
};

export type BoundaryPolicyInput = Partial<BoundaryPolicy>;

export type TerminalPolicy = {
  roles: TerminalRole[];
  maxTerminals: number;
  includeIntermediate: boolean;
  stopAtTerminal: boolean;
};

export type TerminalPolicyInput = Partial<TerminalPolicy> & {
  roles?: TerminalRole[];
};

export type ScopePolicy = {
  direction: SliceDirection;
  boundaryPolicy: BoundaryPolicy;
  terminalPolicy: TerminalPolicy;
};

export type ScopeCandidate = {
  id: string;
  kind: ScopeKind;
  adapter: string;
  label: string;
  entryElementId: string;
  entry: SourceLocation;
  framework: string | null;
  proof: EvidenceProof[];
  defaults: ScopePolicy;
};

export type ScopeSeed = {
  candidateId: string;
  entryElementId: string;
  adapter: string;
  label: string;
  framework: string | null;
  proof: EvidenceProof[];
  defaults: ScopePolicy;
};

export type EvidenceGapReason =
  | "unsupported-syntax"
  | "dynamic-dispatch"
  | "external-code"
  | "identity-lost"
  | "unresolved-symbol"
  | "runtime-only"
  | "disconnected"
  | "unsupported-boundary"
  | "ambiguous-target"
  | "unproven-handoff"
  | "budget-exhausted";

export type EvidenceGap = {
  id: string;
  from: string | null;
  to: string | null;
  label: string;
  reason: EvidenceGapReason;
  status: Exclude<EvidenceStatus, "proven">;
  location: SourceLocation | null;
  proof: EvidenceProof[];
};

export type SliceOrigin = {
  elementId: string;
  role: OriginRole;
  label: string;
  status: EvidenceStatus;
  proof: EvidenceProof[];
};

export type SliceTerminal = {
  elementId: string;
  role: TerminalRole;
  label: string;
  status: EvidenceStatus;
  proof: EvidenceProof[];
};

export type Coverage = {
  status: EvidenceStatus;
  complete: boolean;
  direction: SliceDirection;
  budget: {
    limit: number;
    used: number;
    exhausted: boolean;
  };
  budgetExhausted: boolean;
  elements: { total: number; proven: number; partial: number; unsupported: number };
  relations: { total: number; proven: number; partial: number; unsupported: number };
  origins: number;
  terminals: number;
  gaps: number;
  notes: string[];
};

/**
 * The transport shape of every bounded scope query.
 * Keep these six keys exact so CLI, API, and future adapters can share it.
 */
export type EvidenceSlice = {
  elements: ProgramElement[];
  relations: ProgramRelation[];
  origins: SliceOrigin[];
  terminals: SliceTerminal[];
  gaps: EvidenceGap[];
  coverage: Coverage;
};

export type EvidenceSliceQuery = {
  seed: ScopeSeed;
  direction?: SliceDirection;
  boundaryPolicy?: BoundaryPolicyInput;
  terminalPolicy?: TerminalPolicyInput;
  /** Maximum traversal work. The query reports a gap when this is exhausted. */
  budget?: number;
};

export const DEFAULT_BOUNDARY_POLICY: Readonly<BoundaryPolicy> = {
  maxDepth: 48,
  maxElements: 128,
  maxRelations: 256,
  includeExternal: true,
  includeUnsupported: true,
  includeFramework: true,
  stopAtBoundary: false,
};

export const DEFAULT_TERMINAL_POLICY: Readonly<TerminalPolicy> = {
  roles: [
    "render",
    "component-occurrence",
    "stdout",
    "file-write",
    "exit",
    "side-effect",
    "return",
    "http-response",
    "response",
    "message",
    "child-process",
    "completion",
  ],
  maxTerminals: 64,
  includeIntermediate: true,
  stopAtTerminal: false,
};

export const DEFAULT_SCOPE_POLICY: Readonly<ScopePolicy> = {
  direction: "forward",
  boundaryPolicy: DEFAULT_BOUNDARY_POLICY,
  terminalPolicy: DEFAULT_TERMINAL_POLICY,
};

export function boundaryPolicy(overrides: BoundaryPolicyInput = {}): BoundaryPolicy {
  return {
    ...DEFAULT_BOUNDARY_POLICY,
    ...overrides,
    maxDepth: positiveInteger(overrides.maxDepth, DEFAULT_BOUNDARY_POLICY.maxDepth),
    maxElements: positiveInteger(overrides.maxElements, DEFAULT_BOUNDARY_POLICY.maxElements),
    maxRelations: positiveInteger(overrides.maxRelations, DEFAULT_BOUNDARY_POLICY.maxRelations),
  };
}

export function terminalPolicy(overrides: TerminalPolicyInput = {}): TerminalPolicy {
  const roles = overrides.roles ?? DEFAULT_TERMINAL_POLICY.roles;
  return {
    ...DEFAULT_TERMINAL_POLICY,
    ...overrides,
    roles: [...new Set(roles)],
    maxTerminals: positiveInteger(overrides.maxTerminals, DEFAULT_TERMINAL_POLICY.maxTerminals),
  };
}

export function scopePolicy(overrides: Partial<ScopePolicy> = {}): ScopePolicy {
  return {
    direction: overrides.direction ?? DEFAULT_SCOPE_POLICY.direction,
    boundaryPolicy: boundaryPolicy(overrides.boundaryPolicy),
    terminalPolicy: terminalPolicy(overrides.terminalPolicy),
  };
}

export function scopeSeedFor(candidate: ScopeCandidate): ScopeSeed {
  return {
    candidateId: candidate.id,
    entryElementId: candidate.entryElementId,
    adapter: candidate.adapter,
    label: candidate.label,
    framework: candidate.framework,
    proof: candidate.proof,
    defaults: scopePolicy(candidate.defaults),
  };
}

/** Stable identity helper for source-backed elements. */
export function sourceElementId(source: SourceIdentity, kind: string): string {
  return `element:${stableHash(`${normalizeFile(source.file)}:${source.start}:${source.end}:${kind}`)}`;
}

/** Stable identity helper for source-backed relations. */
export function sourceRelationId(
  from: string,
  to: string,
  kind: string,
  proof: Pick<EvidenceProof, "locations">,
): string {
  const locations = proof.locations
    .map((location) => `${normalizeFile(location.file)}:${location.span.startLine}:${location.span.startColumn}:${location.span.endLine}:${location.span.endColumn}`)
    .join(",");
  return `relation:${stableHash(`${from}:${to}:${kind}:${locations}`)}`;
}

/** Stable identity helper for an adapter-owned scope candidate. */
export function scopeCandidateId(adapter: string, entry: SourceIdentity): string {
  return `scope:${stableHash(`${adapter}:${normalizeFile(entry.file)}:${entry.start}:${entry.end}`)}`;
}

export function normalizeFile(file: string): string {
  return file.replaceAll("\\", "/");
}

export function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value != null && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}
