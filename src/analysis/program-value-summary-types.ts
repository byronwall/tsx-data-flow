import type * as TypeScript from "typescript";
import type { ProgramEvidenceLocation } from "./program-evidence";

export type ProgramValueSummaryStatus =
  | "proven"
  | "partial"
  | "unsupported"
  | "cycle"
  | "budget-exhausted";

export type ProgramValueSummaryConfidence = "proven" | "partial";

export type ProgramValueSummaryKind =
  | "object-literal"
  | "immutable-alias"
  | "first-party-call"
  | "literal"
  | "source-expression"
  | "parameter"
  | "unsupported";

export type ProgramValueSummaryIssueReason =
  | "mutable-alias"
  | "unresolved-call"
  | "nested-unsupported-function"
  | "computed-key"
  | "spread-member"
  | "spread-only-members"
  | "inconsistent-returns"
  | "missing-return"
  | "missing-argument"
  | "unsupported-expression"
  | "alias-cycle"
  | "call-cycle"
  | "alias-depth"
  | "call-depth"
  | "return-branches"
  | "member-budget"
  | "parameter-binding";

export type ProgramValueProofKind =
  | "compiler-symbol"
  | "declaration"
  | "alias"
  | "initializer"
  | "call-target"
  | "return-expression"
  | "argument-binding"
  | "property-access"
  | "object-member"
  | "partial-classification"
  | "cycle"
  | "budget";

export type ProgramValueProof = {
  kind: ProgramValueProofKind;
  detail: string;
  locations: readonly ProgramEvidenceLocation[];
};

export type ProgramValueSourceExpression = {
  id: string;
  text: string;
  node: TypeScript.Expression;
  location: ProgramEvidenceLocation;
  symbolId: string | null;
  declarationId: string | null;
};

export type ProgramValueDeclarationIdentity = {
  id: string;
  symbolId: string | null;
  name: string | null;
  node: TypeScript.Declaration;
  location: ProgramEvidenceLocation;
};

export type ProgramValueFunctionIdentity = {
  id: string;
  symbolId: string | null;
  name: string | null;
  declaration: TypeScript.FunctionLikeDeclaration;
  location: ProgramEvidenceLocation;
};

export type ProgramValueAliasStep = {
  declaration: ProgramValueDeclarationIdentity;
  reference: ProgramValueSourceExpression;
  initializer: ProgramValueSourceExpression;
  propertyName: string | null;
  proof: readonly ProgramValueProof[];
};

export type ProgramValueParameterBinding = {
  parameter: ProgramValueDeclarationIdentity;
  argument: ProgramValueSourceExpression;
  argumentIndex: number;
  proof: readonly ProgramValueProof[];
};

export type ProgramValueResolution = {
  status: ProgramValueSummaryStatus;
  confidence: ProgramValueSummaryConfidence;
  kind: ProgramValueSummaryKind;
  resolvedKind: ProgramValueSummaryKind;
  expression: ProgramValueSourceExpression;
  resolvedExpression: ProgramValueSourceExpression | null;
  declaration: ProgramValueDeclarationIdentity | null;
  resolvedDeclaration: ProgramValueDeclarationIdentity | null;
  callTarget: ProgramValueFunctionIdentity | null;
  aliasChain: readonly ProgramValueAliasStep[];
  parameterBindings: readonly ProgramValueParameterBinding[];
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

export type ProgramValueSummaryIssue = {
  reason: ProgramValueSummaryIssueReason;
  status: ProgramValueSummaryStatus;
  detail: string;
  location: ProgramEvidenceLocation | null;
  proof: readonly ProgramValueProof[];
};

export type ProgramValueTraceStepKind =
  | "member"
  | "alias"
  | "initializer"
  | "parameter-binding"
  | "resolved-source";

export type ProgramValueTraceStep = {
  kind: ProgramValueTraceStepKind;
  label: string;
  source: ProgramValueSourceExpression;
  declarationId: string | null;
  proof: readonly ProgramValueProof[];
};

export type ProgramValueTrace = {
  status: ProgramValueSummaryStatus;
  confidence: ProgramValueSummaryConfidence;
  sourceExpression: ProgramValueSourceExpression | null;
  steps: readonly ProgramValueTraceStep[];
  aliasChain: readonly ProgramValueAliasStep[];
  parameterBindings: readonly ProgramValueParameterBinding[];
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

export type ProgramValueMemberSource = {
  memberPath: readonly string[];
  sourceExpression: ProgramValueSourceExpression | null;
  resolvedSourceExpression: ProgramValueSourceExpression | null;
  sourcePath: readonly ProgramValueTraceStep[];
  trace: ProgramValueTrace;
  status: ProgramValueSummaryStatus;
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

export type ProgramValueMember = {
  id: string;
  name: string;
  memberPath: readonly string[];
  sourceExpression: ProgramValueSourceExpression | null;
  sourceExpressions: readonly ProgramValueSourceExpression[];
  resolvedSourceExpression: ProgramValueSourceExpression | null;
  sourcePath: readonly ProgramValueTraceStep[];
  sources: readonly ProgramValueMemberSource[];
  status: ProgramValueSummaryStatus;
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

export type ProgramValueReturnBranch = {
  id: string;
  expression: ProgramValueSourceExpression | null;
  resolution: ProgramValueResolution | null;
  members: readonly ProgramValueMember[];
  unknownMembers: boolean;
  status: ProgramValueSummaryStatus;
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

export type ProgramValueSummaryBudgetOptions = {
  maxCallDepth?: number;
  maxReturnBranches?: number;
  maxMembers?: number;
  maxAliasDepth?: number;
};

export type ProgramValueSummaryOptions = ProgramValueSummaryBudgetOptions;

export type ProgramValueSummaryBudget = {
  maxCallDepth: number;
  maxReturnBranches: number;
  maxMembers: number;
  maxAliasDepth: number;
  callDepth: number;
  returnBranches: number;
  members: number;
};

export type ProgramValueSummary = {
  id: string;
  status: ProgramValueSummaryStatus;
  confidence: ProgramValueSummaryConfidence;
  kind: ProgramValueSummaryKind;
  resolvedKind: ProgramValueSummaryKind;
  resolution: ProgramValueResolution;
  callTarget: ProgramValueFunctionIdentity | null;
  argumentBindings: readonly ProgramValueParameterBinding[];
  returns: readonly ProgramValueReturnBranch[];
  members: readonly ProgramValueMember[];
  unknownMembers: boolean;
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
  budget: ProgramValueSummaryBudget;
};
