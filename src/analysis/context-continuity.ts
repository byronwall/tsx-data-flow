import type { EvidenceProof, EvidenceStatus, SourceLocation } from "./scope-seam";

export type ContextMemberCertainty = "proven" | "unknown";

export type ContextContinuityGapReason =
  | "missing-provider"
  | "ambiguous-provider"
  | "dynamic-context-identity"
  | "dynamic-provider-identity"
  | "unsupported-wrapper"
  | "ambiguous-ownership"
  | "unproven-member-identity"
  | "unsupported-syntax"
  | "unresolved-symbol";

export type ContextContinuityRecordStatus = Exclude<EvidenceStatus, "unsupported"> | "unsupported";

export type ContextDeclarationRecord = {
  id: string;
  compilerIdentity: string;
  sourceIdentity: string;
  label: string;
  location: SourceLocation;
  defaultValueId: string | null;
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextProvidedValueRecord = {
  id: string;
  contextDeclarationId: string;
  providerOccurrenceId: string | null;
  sourceKind: "provider" | "default";
  expression: string;
  location: SourceLocation;
  memberNames: string[];
  memberCertainty: ContextMemberCertainty;
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextProviderOccurrenceRecord = {
  id: string;
  contextDeclarationId: string;
  renderOccurrenceId: string;
  ownership: "scope-entry" | "caller-owned" | "definition-owned";
  repetition: "single" | "conditional" | "collection" | "unknown";
  location: SourceLocation;
  valueId: string;
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextReadRecord = {
  id: string;
  contextDeclarationId: string;
  consumerOccurrenceId: string;
  expression: string;
  location: SourceLocation;
  members: string[];
  memberCertainty: ContextMemberCertainty;
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextConsumerOccurrenceRecord = {
  id: string;
  contextDeclarationId: string;
  renderOccurrenceId: string;
  readIds: string[];
  terminalIds: string[];
  repetition: "single" | "conditional" | "collection" | "unknown";
  location: SourceLocation;
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextContinuityLink = {
  id: string;
  contextDeclarationId: string;
  providerOccurrenceId: string | null;
  providedValueId: string;
  readId: string;
  consumerOccurrenceId: string;
  terminalIds: string[];
  members: string[];
  memberCertainty: ContextMemberCertainty;
  sourceKind: "provider" | "default";
  renderAncestry: string[];
  nearestProvider: boolean;
  repetition: "single" | "conditional" | "collection" | "unknown";
  status: ContextContinuityRecordStatus;
  proof: EvidenceProof[];
};

export type ContextContinuityGap = {
  id: string;
  contextDeclarationId: string | null;
  providerOccurrenceId: string | null;
  readId: string | null;
  consumerOccurrenceId: string | null;
  reason: ContextContinuityGapReason;
  label: string;
  status: "partial" | "unsupported";
  location: SourceLocation | null;
  proof: EvidenceProof[];
};

export type ContextContinuityCounts = {
  declarations: number;
  providers: number;
  values: number;
  reads: number;
  consumers: number;
  links: number;
  gaps: number;
};

export type RouteContextContinuity = {
  status: "complete" | "partial" | "unavailable";
  counts: ContextContinuityCounts;
  declarations: ContextDeclarationRecord[];
  providers: ContextProviderOccurrenceRecord[];
  values: ContextProvidedValueRecord[];
  reads: ContextReadRecord[];
  consumers: ContextConsumerOccurrenceRecord[];
  links: ContextContinuityLink[];
  gaps: ContextContinuityGap[];
};

export function unavailableContextContinuity(reason: string): RouteContextContinuity {
  return {
    status: "unavailable",
    counts: {
      declarations: 0,
      providers: 0,
      values: 0,
      reads: 0,
      consumers: 0,
      links: 0,
      gaps: 1,
    },
    declarations: [],
    providers: [],
    values: [],
    reads: [],
    consumers: [],
    links: [],
    gaps: [{
      id: `context-gap:unavailable:${reason}`,
      contextDeclarationId: null,
      providerOccurrenceId: null,
      readId: null,
      consumerOccurrenceId: null,
      reason: "unsupported-syntax",
      label: reason,
      status: "unsupported",
      location: null,
      proof: [],
    }],
  };
}
