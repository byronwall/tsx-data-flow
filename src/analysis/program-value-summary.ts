import * as TypeScript from "typescript";
import { programForRoot } from "./program-evidence-loading";
import {
  ProgramValueSummaryResolver,
  type ProgramValueEvaluationState,
  type ProgramValueInternalResolution,
} from "./program-value-summary-resolver";
import type {
  ProgramValueFunctionIdentity,
  ProgramValueMember,
  ProgramValueMemberSource,
  ProgramValueParameterBinding,
  ProgramValueProof,
  ProgramValueResolution,
  ProgramValueReturnBranch,
  ProgramValueSummary,
  ProgramValueSummaryIssue,
  ProgramValueSummaryKind,
  ProgramValueSummaryOptions,
  ProgramValueSummaryStatus,
  ProgramValueTrace,
  ProgramValueTraceStep,
} from "./program-value-summary-types";
import {
  isComputedObjectMember,
  isFunctionObjectMember,
  locationKey,
  propertySourceExpression,
  proofLocation,
  returnExpressionsForFunction,
  sourceExpression,
  staticObjectMemberName,
} from "./program-value-summary-support";
import { stableId } from "./program-evidence-support";

type MemberExtraction = {
  members: readonly ProgramValueMember[];
  unknownMembers: boolean;
  status: ProgramValueSummaryStatus;
  issues: readonly ProgramValueSummaryIssue[];
  proof: readonly ProgramValueProof[];
};

type BranchEvaluation = {
  branch: ProgramValueReturnBranch;
  shapeKind: ProgramValueSummaryKind;
  shapeKeys: readonly string[];
};

export class ProgramValueSummaryAnalyzer extends ProgramValueSummaryResolver {
  public summarizeExpression(expression: TypeScript.Expression): ProgramValueSummary {
    const state = this.newState();
    return this.summarizeResolved(this.resolveExpressionInternal(expression, state), state);
  }

  public summarizeCall(call: TypeScript.CallExpression): ProgramValueSummary {
    return this.summarizeExpression(call);
  }

  public summarizeReturnedValue(expression: TypeScript.Expression): ProgramValueSummary {
    return this.summarizeExpression(expression);
  }

  public enumerateMembers(summary: ProgramValueSummary): readonly ProgramValueMember[] {
    return summary.members;
  }

  public enumerateReturnedObjectMembers(summary: ProgramValueSummary): readonly ProgramValueMember[] {
    return this.enumerateMembers(summary);
  }

  private summarizeResolved(resolved: ProgramValueInternalResolution, state: ProgramValueEvaluationState): ProgramValueSummary {
    const resolution = resolved.resolution;
    const summaryId = stableId("program-value-summary", [resolution.expression.id, resolution.resolvedExpression?.id ?? "", resolution.callTarget?.id ?? ""]);
    if (resolution.status !== "proven" || !resolved.terminal) {
      return this.summary(summaryId, resolution, null, [], false, resolution.status, resolution.issues, resolution.proof, state);
    }
    if (resolution.resolvedKind === "object-literal" && this.context.ts.isObjectLiteralExpression(resolved.terminal)) {
      const extraction = this.extractObjectMembers(resolved.terminal, state, summaryId, []);
      return this.summary(summaryId, resolution, null, [], extraction.unknownMembers, extraction.status, [...resolution.issues, ...extraction.issues], [...resolution.proof, ...extraction.proof], state, extraction.members);
    }
    if (resolution.resolvedKind === "first-party-call" && this.context.ts.isCallExpression(resolved.terminal) && resolution.callTarget) {
      return this.summarizeFunctionCall(resolved.terminal, resolution, state, summaryId);
    }
    return this.summary(summaryId, resolution, null, [], false, "proven", resolution.issues, resolution.proof, state);
  }

  private summarizeFunctionCall(
    call: TypeScript.CallExpression,
    resolution: ProgramValueResolution,
    state: ProgramValueEvaluationState,
    summaryId: string,
  ): ProgramValueSummary {
    const target = resolution.callTarget;
    if (!target) return this.summaryUnsupported(summaryId, resolution, state, "unresolved-call", "The function call has no compiler-resolved first-party target.", call);
    if (state.callStack.has(target.id)) {
      const issue = this.issue("call-cycle", "cycle", "The first-party call target repeats in the active declaration chain.", target.declaration, [this.proof("cycle", "The function declaration identity is already active.", [target.declaration])]);
      return this.summary(summaryId, resolution, target, [], false, "cycle", [issue], issue.proof, state);
    }
    if (state.activeCallDepth >= this.options.maxCallDepth) {
      const issue = this.issue("call-depth", "budget-exhausted", `The first-party call depth reached the limit of ${this.options.maxCallDepth}.`, call, [this.proof("budget", "The call-depth budget stopped a deeper function return summary.", [call])]);
      return this.summary(summaryId, resolution, target, [], false, "budget-exhausted", [issue], issue.proof, state);
    }
    const returns = returnExpressionsForFunction(this.context.ts, target.declaration);
    const bindingResult = this.argumentBindings(call, target.declaration);
    const baseIssues = [...bindingResult.issues];
    if (returns.bareReturns.length > 0 || returns.expressions.length === 0) {
      const reason = returns.bareReturns.length > 0 ? "inconsistent-returns" : "missing-return";
      const detail = returns.bareReturns.length > 0 ? "The function has a bare or inconsistent return branch." : "The first-party function has no source return expression.";
      baseIssues.push(this.issue(reason, "unsupported", detail, returns.bareReturns[0] ?? target.declaration, [this.proof("return-expression", "The function return shape is incomplete.", [returns.bareReturns[0] ?? target.declaration])]));
      return this.summary(summaryId, resolution, target, bindingResult.bindings, false, "unsupported", baseIssues, resolution.proof, state);
    }
    const availableBranches = this.options.maxReturnBranches - state.budget.returnBranches;
    if (availableBranches <= 0 || returns.expressions.length > availableBranches) {
      const issue = this.issue("return-branches", "budget-exhausted", `The return-branch budget allows at most ${this.options.maxReturnBranches} branches.`, target.declaration, [this.proof("budget", "The return-branch budget stopped complete branch enumeration.", [target.declaration])]);
      if (availableBranches <= 0) return this.summary(summaryId, resolution, target, bindingResult.bindings, false, "budget-exhausted", [...baseIssues, issue], resolution.proof, state);
      baseIssues.push(issue);
    }
    const branchLimit = Math.min(returns.expressions.length, Math.max(0, availableBranches));
    const previousBindings = state.parameterBindings;
    state.parameterBindings = new Map([...previousBindings, ...bindingResult.byKey]);
    state.callStack.add(target.id);
    state.activeCallDepth += 1;
    state.budget.callDepth = Math.max(state.budget.callDepth, state.activeCallDepth);
    const branches: BranchEvaluation[] = [];
    try {
      for (const expression of returns.expressions.slice(0, branchLimit)) {
        state.budget.returnBranches += 1;
        branches.push(this.evaluateReturnBranch(expression, state, summaryId, target));
      }
    } finally {
      state.activeCallDepth -= 1;
      state.callStack.delete(target.id);
      state.parameterBindings = previousBindings;
    }
    const merged = this.mergeBranches(branches);
    const status = baseIssues.some((issue) => issue.status === "budget-exhausted")
      ? "budget-exhausted"
      : mergeStatuses(baseIssues.length > 0 ? "partial" : "proven", merged.status);
    return this.summary(summaryId, resolution, target, bindingResult.bindings, merged.unknownMembers, status, [...baseIssues, ...merged.issues], [...resolution.proof, ...merged.proof], state, merged.members, branches.map((item) => item.branch));
  }

  private evaluateReturnBranch(
    expression: TypeScript.Expression,
    state: ProgramValueEvaluationState,
    summaryId: string,
    target: ProgramValueFunctionIdentity,
  ): BranchEvaluation {
    const resolved = this.resolveExpressionInternal(expression, state);
    const resolution = resolved.resolution;
    const proof = [this.proof("return-expression", "The function returns this exact source expression.", [expression, target.declaration]), ...resolution.proof];
    if (resolution.status !== "proven" || !resolved.terminal) {
      const branch = this.returnBranch(summaryId, expression, resolution, [], false, resolution.status, resolution.issues, proof);
      return { branch, shapeKind: "unsupported", shapeKeys: [] };
    }
    if (resolution.resolvedKind === "object-literal" && this.context.ts.isObjectLiteralExpression(resolved.terminal)) {
      const extraction = this.extractObjectMembers(resolved.terminal, state, summaryId, []);
      const branch = this.returnBranch(summaryId, expression, resolution, extraction.members, extraction.unknownMembers, extraction.status, extraction.issues, [...proof, ...extraction.proof]);
      return { branch, shapeKind: "object-literal", shapeKeys: extraction.members.map((member) => member.name).sort() };
    }
    if (resolution.resolvedKind === "first-party-call" && this.context.ts.isCallExpression(resolved.terminal)) {
      const nested = this.summarizeResolved(resolved, state);
      const branch = this.returnBranch(summaryId, expression, resolution, nested.members, nested.unknownMembers, nested.status, nested.issues, [...proof, ...nested.proof]);
      const shapeKind = nested.members.length > 0 || nested.unknownMembers ? "object-literal" : nested.resolvedKind;
      return { branch, shapeKind, shapeKeys: nested.members.map((member) => member.name).sort() };
    }
    const branch = this.returnBranch(summaryId, expression, resolution, [], false, "proven", [], proof);
    return { branch, shapeKind: resolution.resolvedKind, shapeKeys: [] };
  }

  private extractObjectMembers(
    object: TypeScript.ObjectLiteralExpression,
    state: ProgramValueEvaluationState,
    summaryId: string,
    parentPath: readonly string[],
  ): MemberExtraction {
    const byName = new Map<string, ProgramValueMemberSource[]>();
    const issues: ProgramValueSummaryIssue[] = [];
    const proof: ProgramValueProof[] = [this.proof("object-member", "The object literal is the returned value shape.", [object])];
    let unknownMembers = false;
    let budgetStopped = false;
    for (const property of object.properties) {
      if (this.context.ts.isSpreadAssignment(property)) {
        unknownMembers = true;
        issues.push(this.issue("spread-member", "partial", "Spread-derived object members are not enumerated by the bounded summary.", property, [this.proof("partial-classification", "The spread assignment may contribute unknown member names.", [property])]));
        continue;
      }
      if (isComputedObjectMember(this.context.ts, property) || !staticObjectMemberName(this.context.ts, property)) {
        unknownMembers = true;
        issues.push(this.issue("computed-key", "partial", "Computed or unsupported object member names are not proven.", property, [this.proof("partial-classification", "The member key is not a supported static object key.", [property])]));
        continue;
      }
      const name = staticObjectMemberName(this.context.ts, property);
      if (!name) continue;
      if (state.budget.members >= this.options.maxMembers) {
        budgetStopped = true;
        issues.push(this.issue("member-budget", "budget-exhausted", `The object member budget reached the limit of ${this.options.maxMembers}.`, property, [this.proof("budget", "The finite member budget stopped further member enumeration.", [property])]));
        break;
      }
      state.budget.members += 1;
      const member = this.memberSource(property, propertySourceExpression(this.context.ts, property), [...parentPath, name], state);
      byName.set(name, [...(byName.get(name) ?? []), member]);
      proof.push(...member.proof);
      issues.push(...member.issues);
    }
    if (byName.size === 0 && unknownMembers) {
      issues.push(this.issue("spread-only-members", "partial", "The object has no statically enumerable members.", object, [this.proof("partial-classification", "Only spread or computed members remain unknown.", [object])]));
    }
    const members = [...byName.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, sources]) => this.combineMember(summaryId, name, sources));
    return { members, unknownMembers, status: budgetStopped ? "budget-exhausted" : unknownMembers || issues.length > 0 ? "partial" : "proven", issues, proof };
  }

  private memberSource(
    property: TypeScript.ObjectLiteralElementLike,
    expression: TypeScript.Expression | null,
    memberPath: readonly string[],
    state: ProgramValueEvaluationState,
  ): ProgramValueMemberSource {
    if (!expression || isFunctionObjectMember(this.context.ts, property)) {
      const issue = this.issue("nested-unsupported-function", "unsupported", "Nested function-valued object members are not traversed.", property, [this.proof("partial-classification", "The object member contains a nested function value.", [property])]);
      return { memberPath, sourceExpression: expression ? sourceExpression(this.context, expression) : null, resolvedSourceExpression: null, sourcePath: [], trace: this.emptyTrace("unsupported", issue), status: "unsupported", issues: [issue], proof: issue.proof };
    }
    const trace = this.traceInternal(expression, state);
    const source = sourceExpression(this.context, expression);
    const memberProof = this.proof("object-member", "The static object member retains its exact source expression.", [property, expression]);
    const sourcePath: ProgramValueTraceStep[] = [{ kind: "member", label: memberPath.join("."), source, declarationId: source.declarationId, proof: [memberProof] }, ...trace.steps];
    return { memberPath, sourceExpression: source, resolvedSourceExpression: trace.sourceExpression, sourcePath, trace, status: trace.status, issues: trace.issues, proof: [memberProof, ...trace.proof] };
  }

  private combineMember(summaryId: string, name: string, sources: readonly ProgramValueMemberSource[]): ProgramValueMember {
    const sourceExpressions = sources.flatMap((source) => source.sourceExpression ? [source.sourceExpression] : []);
    return {
      id: stableId("program-value-member", [summaryId, name, sources.map((source) => source.sourceExpression?.id ?? "")]),
      name,
      memberPath: sources[0]?.memberPath ?? [name],
      sourceExpression: sourceExpressions[0] ?? null,
      sourceExpressions,
      resolvedSourceExpression: sources[0]?.resolvedSourceExpression ?? null,
      sourcePath: sources[0]?.sourcePath ?? [],
      sources,
      status: sources.reduce((status, source) => mergeStatuses(status, source.status), "proven" as ProgramValueSummaryStatus),
      issues: sources.flatMap((source) => source.issues),
      proof: sources.flatMap((source) => source.proof),
    };
  }

  private mergeBranches(branches: readonly BranchEvaluation[]): MemberExtraction {
    if (branches.length === 0) return { members: [], unknownMembers: false, status: "unsupported", issues: [], proof: [] };
    const issues = branches.flatMap((branch) => branch.branch.issues);
    const proof = branches.flatMap((branch) => branch.branch.proof);
    const first = branches[0];
    const sameShape = branches.every((branch) => branch.shapeKind === first.shapeKind && arraysEqual(first.shapeKeys, branch.shapeKeys));
    const budgetExhausted = branches.some((branch) => branch.branch.status === "budget-exhausted");
    if (!sameShape && !budgetExhausted) {
      issues.push(this.issue("inconsistent-returns", "unsupported", "Return branches do not expose one consistent static member shape.", first.branch.expression?.node ?? null, [this.proof("partial-classification", "The returned object member sets differ across source return expressions.", branches.flatMap((branch) => branch.branch.expression ? [branch.branch.expression.node] : []))]));
      return { members: [], unknownMembers: branches.some((branch) => branch.branch.unknownMembers), status: "unsupported", issues, proof };
    }
    const byName = new Map<string, ProgramValueMemberSource[]>();
    for (const branch of branches) for (const member of branch.branch.members) for (const source of member.sources) byName.set(member.name, [...(byName.get(member.name) ?? []), source]);
    const branchId = stableId("program-value-branch-shape", [branches.map((branch) => branch.branch.id)]);
    const members = [...byName.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, sources]) => this.combineMember(branchId, name, sources));
    return { members, unknownMembers: branches.some((branch) => branch.branch.unknownMembers), status: budgetExhausted ? "budget-exhausted" : branches.reduce((status, branch) => mergeStatuses(status, branch.branch.status), "proven" as ProgramValueSummaryStatus), issues, proof };
  }

  private summary(
    id: string,
    resolution: ProgramValueResolution,
    callTarget: ProgramValueFunctionIdentity | null,
    argumentBindings: readonly ProgramValueParameterBinding[],
    unknownMembers: boolean,
    status: ProgramValueSummaryStatus,
    issues: readonly ProgramValueSummaryIssue[],
    proof: readonly ProgramValueProof[],
    state: ProgramValueEvaluationState,
    members: readonly ProgramValueMember[] = [],
    returns: readonly ProgramValueReturnBranch[] = [],
  ): ProgramValueSummary {
    return {
      id,
      status,
      confidence: status === "proven" ? "proven" : "partial",
      kind: resolution.kind,
      resolvedKind: resolution.resolvedKind,
      resolution,
      callTarget,
      argumentBindings,
      returns,
      members,
      unknownMembers,
      issues: uniqueIssues(issues),
      proof: uniqueProofs(proof),
      budget: { ...state.budget },
    };
  }

  private summaryUnsupported(
    id: string,
    resolution: ProgramValueResolution,
    state: ProgramValueEvaluationState,
    reason: ProgramValueSummaryIssue["reason"],
    detail: string,
    node: TypeScript.Node,
  ): ProgramValueSummary {
    const issue = this.issue(reason, "unsupported", detail, node, [this.proof("partial-classification", detail, [node])]);
    return this.summary(id, resolution, null, [], false, "unsupported", [issue], issue.proof, state);
  }

  private returnBranch(
    summaryId: string,
    expression: TypeScript.Expression,
    resolution: ProgramValueResolution | null,
    members: readonly ProgramValueMember[],
    unknownMembers: boolean,
    status: ProgramValueSummaryStatus,
    issues: readonly ProgramValueSummaryIssue[],
    proof: readonly ProgramValueProof[],
  ): ProgramValueReturnBranch {
    return {
      id: stableId("program-value-return", [summaryId, locationKey(proofLocation(this.context, expression))]),
      expression: sourceExpression(this.context, expression),
      resolution,
      members,
      unknownMembers,
      status,
      issues: uniqueIssues(issues),
      proof: uniqueProofs(proof),
    };
  }

}

export function createProgramValueSummaryAnalyzer(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  options: ProgramValueSummaryOptions = {},
): ProgramValueSummaryAnalyzer {
  return new ProgramValueSummaryAnalyzer(ts, program, root, options);
}

export function createProgramValueSummaryAnalyzerForRoot(
  root: string,
  options: ProgramValueSummaryOptions = {},
): ProgramValueSummaryAnalyzer {
  return new ProgramValueSummaryAnalyzer(TypeScript, programForRoot(root), root, options);
}

export function resolveProgramValueExpression(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  expression: TypeScript.Expression,
  options: ProgramValueSummaryOptions = {},
): ProgramValueResolution {
  return createProgramValueSummaryAnalyzer(ts, program, root, options).resolveExpression(expression);
}

export function summarizeProgramValueExpression(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  expression: TypeScript.Expression,
  options: ProgramValueSummaryOptions = {},
): ProgramValueSummary {
  return createProgramValueSummaryAnalyzer(ts, program, root, options).summarizeExpression(expression);
}

export function summarizeProgramValueCall(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  call: TypeScript.CallExpression,
  options: ProgramValueSummaryOptions = {},
): ProgramValueSummary {
  return createProgramValueSummaryAnalyzer(ts, program, root, options).summarizeCall(call);
}

export function enumerateProgramValueMembers(summary: ProgramValueSummary): readonly ProgramValueMember[] {
  return summary.members;
}

export function traceProgramValueSource(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  expression: TypeScript.Expression,
  options: ProgramValueSummaryOptions = {},
): ProgramValueTrace {
  return createProgramValueSummaryAnalyzer(ts, program, root, options).traceReturnedBinding(expression);
}

function mergeStatuses(left: ProgramValueSummaryStatus, right: ProgramValueSummaryStatus): ProgramValueSummaryStatus {
  const priority: Record<ProgramValueSummaryStatus, number> = { proven: 0, partial: 1, unsupported: 2, cycle: 3, "budget-exhausted": 4 };
  return priority[right] > priority[left] ? right : left;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueIssues(issues: readonly ProgramValueSummaryIssue[]): readonly ProgramValueSummaryIssue[] {
  return [...new Map(issues.map((issue) => [`${issue.reason}:${issue.location ? locationKey(issue.location) : ""}:${issue.detail}`, issue])).values()];
}

function uniqueProofs(proofs: readonly ProgramValueProof[]): readonly ProgramValueProof[] {
  return [...new Map(proofs.map((proof) => [`${proof.kind}:${proof.detail}:${proof.locations.map(locationKey).join(",")}`, proof])).values()];
}
