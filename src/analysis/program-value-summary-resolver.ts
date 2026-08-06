import * as TypeScript from "typescript";
import type { ProgramEvidenceLocation } from "./program-evidence";
import type {
  ProgramValueAliasStep,
  ProgramValueDeclarationIdentity,
  ProgramValueFunctionIdentity,
  ProgramValueParameterBinding,
  ProgramValueProof,
  ProgramValueResolution,
  ProgramValueSourceExpression,
  ProgramValueSummaryIssue,
  ProgramValueSummaryKind,
  ProgramValueSummaryOptions,
  ProgramValueSummaryStatus,
  ProgramValueTrace,
  ProgramValueTraceStep,
} from "./program-value-summary-types";
import {
  declarationForNode,
  declarationIdentity,
  bindingElementSource,
  functionTarget,
  immutableVariable,
  locationKey,
  parameterDeclarationFor,
  proofLocation,
  sourceExpression,
  type ProgramValueCompilerContext,
  variableDeclarationFor,
  type ProgramValueBindingElementSource,
} from "./program-value-summary-support";
import { unwrap } from "./program-evidence-support";

export const DEFAULT_PROGRAM_VALUE_SUMMARY_OPTIONS: Required<ProgramValueSummaryOptions> = {
  maxCallDepth: 4,
  maxReturnBranches: 8,
  maxMembers: 32,
  maxAliasDepth: 16,
};

export type ProgramValueMutableBudget = {
  maxCallDepth: number;
  maxReturnBranches: number;
  maxMembers: number;
  maxAliasDepth: number;
  callDepth: number;
  returnBranches: number;
  members: number;
};

export type ProgramValueParameterBindingMap = Map<string, ProgramValueParameterBinding>;

export type ProgramValueEvaluationState = {
  budget: ProgramValueMutableBudget;
  activeCallDepth: number;
  callStack: Set<string>;
  aliasStack: Set<string>;
  parameterStack: Set<string>;
  parameterBindings: ProgramValueParameterBindingMap;
};

export type ProgramValueInternalResolution = {
  resolution: ProgramValueResolution;
  terminal: TypeScript.Expression | null;
};

export class ProgramValueSummaryResolver {
  protected readonly context: ProgramValueCompilerContext;
  protected readonly options: Required<ProgramValueSummaryOptions>;

  constructor(
    ts: typeof TypeScript,
    program: TypeScript.Program,
    root: string,
    options: ProgramValueSummaryOptions = {},
  ) {
    this.context = { ts, checker: program.getTypeChecker(), root };
    this.options = normalizeOptions(options);
  }

  public resolveExpression(expression: TypeScript.Expression): ProgramValueResolution {
    return this.resolveExpressionInternal(expression, this.newState()).resolution;
  }

  public traceReturnedBinding(expression: TypeScript.Expression): ProgramValueTrace {
    return this.traceInternal(expression, this.newState());
  }

  protected resolveExpressionInternal(
    expression: TypeScript.Expression,
    state: ProgramValueEvaluationState,
    aliases: ProgramValueAliasStep[] = [],
    parameterBindings: ProgramValueParameterBinding[] = [],
    aliasDepth = 0,
  ): ProgramValueInternalResolution {
    const current = unwrap(this.context.ts, expression);
    const original = sourceExpression(this.context, expression);
    const currentSource = sourceExpression(this.context, current);
    const sourceDeclaration = declarationIdentity(this.context, declarationForNode(this.context, expression), null);
    if (this.context.ts.isIdentifier(current)) {
      const parameter = this.parameterBindingFor(current, state);
      if (parameter) return this.resolveParameter(current, original, currentSource, sourceDeclaration, parameter, state, aliases, parameterBindings, aliasDepth);
      const variable = variableDeclarationFor(this.context, current);
      if (variable) return this.resolveVariable(current, original, currentSource, sourceDeclaration, variable, state, aliases, parameterBindings, aliasDepth);
      const binding = bindingElementSource(this.context, current);
      if (binding) return this.resolveBindingElement(current, original, currentSource, sourceDeclaration, binding, state, aliases, parameterBindings, aliasDepth);
      const parameterDeclaration = parameterDeclarationFor(this.context, current);
      if (parameterDeclaration) {
        return this.resolution(
          original,
          "parameter",
          "unsupported",
          currentSource,
          sourceDeclaration,
          declarationIdentity(this.context, parameterDeclaration),
          aliases,
          parameterBindings,
          [this.issue("parameter-binding", "unsupported", "The parameter has no call-site argument binding in this summary.", parameterDeclaration, [this.proof("compiler-symbol", "The identifier resolves to a function parameter declaration.", [current, parameterDeclaration])])],
          [this.proof("compiler-symbol", "The source identifier resolves to a parameter.", [current])],
        );
      }
    }
    if (this.context.ts.isObjectLiteralExpression(current)) {
      return this.resolution(
        original,
        aliases.length > 0 ? "immutable-alias" : "object-literal",
        "proven",
        currentSource,
        sourceDeclaration,
        declarationIdentity(this.context, declarationForNode(this.context, current)),
        aliases,
        parameterBindings,
        [],
        [this.proof("object-member", "The value resolves to a source object literal.", [current])],
      );
    }
    if (this.context.ts.isCallExpression(current)) {
      const target = functionTarget(this.context, current);
      if (!target) {
        return this.unsupportedResolution(original, "The call does not resolve to a first-party function with a source body.", current, "unresolved-call", sourceDeclaration, null, aliases, parameterBindings);
      }
      return this.resolution(
        original,
        aliases.length > 0 ? "immutable-alias" : "first-party-call",
        "proven",
        currentSource,
        sourceDeclaration,
        declarationIdentity(this.context, target.identity.declaration, target.symbol),
        aliases,
        parameterBindings,
        [],
        [
          this.proof("call-target", "The call resolves to this first-party function declaration.", [current.expression, target.identity.declaration]),
          this.proof("compiler-symbol", "The compiler resolved the exact call target symbol.", [current.expression]),
        ],
        target.identity,
      );
    }
    if (isLiteralValue(this.context.ts, current)) {
      return this.resolution(original, aliases.length > 0 ? "immutable-alias" : "literal", "proven", currentSource, sourceDeclaration, sourceDeclaration, aliases, parameterBindings, [], [this.proof("declaration", "The value resolves to a source literal expression.", [current])]);
    }
    if (isStaticSourceExpression(this.context.ts, current) && currentSource.symbolId) {
      return this.resolution(original, aliases.length > 0 ? "immutable-alias" : "source-expression", "proven", currentSource, sourceDeclaration, sourceDeclaration, aliases, parameterBindings, [], [this.proof("property-access", "The source expression is a compiler-resolved property or static element access.", [current])]);
    }
    const functionValue = isFunctionValue(this.context.ts, current);
    return this.unsupportedResolution(
      original,
      functionValue ? "A nested function value is outside the bounded value-summary layer." : "The expression form is outside the bounded value-summary layer.",
      current,
      functionValue ? "nested-unsupported-function" : "unsupported-expression",
      sourceDeclaration,
      null,
      aliases,
      parameterBindings,
    );
  }

  private resolveParameter(
    current: TypeScript.Identifier,
    original: ProgramValueSourceExpression,
    currentSource: ProgramValueSourceExpression,
    sourceDeclaration: ProgramValueDeclarationIdentity | null,
    parameter: ProgramValueParameterBinding,
    state: ProgramValueEvaluationState,
    aliases: ProgramValueAliasStep[],
    parameterBindings: ProgramValueParameterBinding[],
    aliasDepth: number,
  ): ProgramValueInternalResolution {
    if (state.parameterStack.has(parameter.parameter.id)) {
      const issue = this.issue("parameter-binding", "cycle", "The parameter binding cycle cannot be resolved.", current, [this.proof("cycle", "The same parameter binding was reached twice.", [current])]);
      return this.resolution(original, "parameter", "cycle", currentSource, sourceDeclaration, null, aliases, parameterBindings, [issue], issue.proof);
    }
    state.parameterStack.add(parameter.parameter.id);
    const nested = this.resolveExpressionInternal(parameter.argument.node, state, aliases, [...parameterBindings, parameter], aliasDepth);
    state.parameterStack.delete(parameter.parameter.id);
    return this.rebaseResolution(nested, original, sourceDeclaration, "parameter");
  }

  private resolveVariable(
    current: TypeScript.Identifier,
    original: ProgramValueSourceExpression,
    currentSource: ProgramValueSourceExpression,
    sourceDeclaration: ProgramValueDeclarationIdentity | null,
    variable: TypeScript.VariableDeclaration,
    state: ProgramValueEvaluationState,
    aliases: ProgramValueAliasStep[],
    parameterBindings: ProgramValueParameterBinding[],
    aliasDepth: number,
  ): ProgramValueInternalResolution {
    const identity = declarationIdentity(this.context, variable);
    if (!immutableVariable(this.context.ts, variable)) {
      const issue = this.issue("mutable-alias", "unsupported", "The value is bound by a mutable variable declaration.", variable, [this.proof("partial-classification", "The compiler declaration is not an immutable const binding.", [variable])]);
      return this.resolution(original, "unsupported", "unsupported", currentSource, sourceDeclaration, identity, aliases, parameterBindings, [issue], [this.proof("declaration", "The compiler resolved the mutable value declaration.", [variable])]);
    }
    if (!variable.initializer || !identity) {
      return this.unsupportedResolution(original, "The immutable binding has no source initializer.", current, "unsupported-expression", sourceDeclaration, identity, aliases, parameterBindings);
    }
    if (state.aliasStack.has(identity.id)) {
      const issue = this.issue("alias-cycle", "cycle", "The immutable alias chain refers back to the same declaration.", variable, [this.proof("cycle", "The compiler declaration identity repeats in the alias chain.", [variable])]);
      return this.resolution(original, "immutable-alias", "cycle", currentSource, sourceDeclaration, identity, aliases, parameterBindings, [issue], issue.proof);
    }
    if (aliasDepth >= this.options.maxAliasDepth) {
      const issue = this.issue("alias-depth", "budget-exhausted", `The immutable alias chain reached the limit of ${this.options.maxAliasDepth}.`, variable, [this.proof("budget", "The alias-depth budget stopped further source resolution.", [variable])]);
      return this.resolution(original, "immutable-alias", "budget-exhausted", currentSource, sourceDeclaration, identity, aliases, parameterBindings, [issue], issue.proof);
    }
    const initializer = sourceExpression(this.context, variable.initializer);
    const aliasStep: ProgramValueAliasStep = {
      declaration: identity,
      reference: currentSource,
      initializer,
      propertyName: null,
      proof: [
        this.proof("alias", "The identifier resolves to an immutable variable declaration.", [current, variable]),
        this.proof("initializer", "The immutable declaration has this exact initializer expression.", [variable.initializer]),
      ],
    };
    state.aliasStack.add(identity.id);
    const nested = this.resolveExpressionInternal(variable.initializer, state, [...aliases, aliasStep], parameterBindings, aliasDepth + 1);
    state.aliasStack.delete(identity.id);
    return this.rebaseResolution(nested, original, sourceDeclaration, "immutable-alias");
  }

  private resolveBindingElement(
    current: TypeScript.Identifier,
    original: ProgramValueSourceExpression,
    currentSource: ProgramValueSourceExpression,
    sourceDeclaration: ProgramValueDeclarationIdentity | null,
    binding: ProgramValueBindingElementSource,
    state: ProgramValueEvaluationState,
    aliases: ProgramValueAliasStep[],
    parameterBindings: ProgramValueParameterBinding[],
    aliasDepth: number,
  ): ProgramValueInternalResolution {
    const identity = declarationIdentity(this.context, binding.binding);
    if (!identity || state.aliasStack.has(identity.id)) {
      const issue = this.issue("alias-cycle", "cycle", "The immutable destructured alias repeats its compiler declaration identity.", binding.binding, [this.proof("cycle", "The destructured binding identity is already active.", [binding.binding])]);
      return this.resolution(original, "immutable-alias", "cycle", currentSource, sourceDeclaration, identity, aliases, parameterBindings, [issue], issue.proof);
    }
    if (aliasDepth >= this.options.maxAliasDepth) {
      const issue = this.issue("alias-depth", "budget-exhausted", `The immutable alias chain reached the limit of ${this.options.maxAliasDepth}.`, binding.binding, [this.proof("budget", "The alias-depth budget stopped further source resolution.", [binding.binding])]);
      return this.resolution(original, "immutable-alias", "budget-exhausted", currentSource, sourceDeclaration, identity, aliases, parameterBindings, [issue], issue.proof);
    }
    const initializer = sourceExpression(this.context, binding.initializer);
    const aliasStep: ProgramValueAliasStep = {
      declaration: identity,
      reference: currentSource,
      initializer,
      propertyName: binding.propertyName,
      proof: [this.proof("alias", "The identifier resolves to an immutable object-binding element.", [current, binding.binding]), this.proof("initializer", "The destructured binding reads from this exact initializer expression.", [binding.initializer])],
    };
    state.aliasStack.add(identity.id);
    const nested = this.resolveExpressionInternal(binding.initializer, state, [...aliases, aliasStep], parameterBindings, aliasDepth + 1);
    state.aliasStack.delete(identity.id);
    return this.rebaseResolution(nested, original, sourceDeclaration, "immutable-alias");
  }

  protected rebaseResolution(
    nested: ProgramValueInternalResolution,
    expression: ProgramValueSourceExpression,
    declaration: ProgramValueDeclarationIdentity | null,
    kind: ProgramValueSummaryKind,
  ): ProgramValueInternalResolution {
    return {
      terminal: nested.terminal,
      resolution: { ...nested.resolution, expression, declaration, kind },
    };
  }

  protected traceInternal(expression: TypeScript.Expression, state: ProgramValueEvaluationState): ProgramValueTrace {
    const resolved = this.resolveExpressionInternal(expression, state);
    const steps: ProgramValueTraceStep[] = [];
    for (const alias of resolved.resolution.aliasChain) {
      steps.push({ kind: "alias", label: alias.propertyName ? `${alias.reference.text} <- ${alias.initializer.text}.${alias.propertyName}` : alias.reference.text, source: alias.reference, declarationId: alias.declaration.id, proof: alias.proof });
      steps.push({ kind: "initializer", label: alias.initializer.text, source: alias.initializer, declarationId: alias.declaration.id, proof: alias.proof });
    }
    for (const binding of resolved.resolution.parameterBindings) {
      steps.push({ kind: "parameter-binding", label: binding.parameter.name ?? binding.parameter.id, source: binding.argument, declarationId: binding.parameter.id, proof: binding.proof });
    }
    if (resolved.resolution.resolvedExpression) {
      steps.push({ kind: "resolved-source", label: resolved.resolution.resolvedExpression.text, source: resolved.resolution.resolvedExpression, declarationId: resolved.resolution.resolvedDeclaration?.id ?? null, proof: resolved.resolution.proof });
    }
    return {
      status: resolved.resolution.status,
      confidence: resolved.resolution.confidence,
      sourceExpression: resolved.resolution.resolvedExpression,
      steps,
      aliasChain: resolved.resolution.aliasChain,
      parameterBindings: resolved.resolution.parameterBindings,
      issues: resolved.resolution.issues,
      proof: resolved.resolution.proof,
    };
  }

  protected argumentBindings(
    call: TypeScript.CallExpression,
    declaration: TypeScript.FunctionLikeDeclaration,
  ): { bindings: readonly ProgramValueParameterBinding[]; byKey: ProgramValueParameterBindingMap; issues: ProgramValueSummaryIssue[] } {
    const bindings: ProgramValueParameterBinding[] = [];
    const byKey: ProgramValueParameterBindingMap = new Map();
    const issues: ProgramValueSummaryIssue[] = [];
    declaration.parameters.forEach((parameter, index) => {
      if (!this.context.ts.isIdentifier(parameter.name)) {
        issues.push(this.issue("parameter-binding", "unsupported", "Destructured parameters do not have a bounded scalar argument binding.", parameter, [this.proof("argument-binding", "The parameter binding pattern is not a supported identifier.", [parameter])]));
        return;
      }
      const identity = declarationIdentity(this.context, parameter, null);
      if (!identity) return;
      const argument = call.arguments[index];
      const expression = argument ? this.context.ts.isSpreadElement(argument) ? null : argument : parameter.initializer;
      if (!expression) {
        issues.push(this.issue("missing-argument", "partial", `No source argument binds to parameter ${parameter.name.text}.`, parameter, [this.proof("argument-binding", "The call has no argument or default initializer for this parameter.", [call, parameter])]));
        return;
      }
      const binding: ProgramValueParameterBinding = {
        parameter: identity,
        argument: sourceExpression(this.context, expression),
        argumentIndex: index,
        proof: [this.proof("argument-binding", "The source call argument binds to this compiler parameter declaration.", [call.arguments[index] ?? parameter, parameter])],
      };
      bindings.push(binding);
      byKey.set(identity.id, binding);
      if (identity.symbolId) byKey.set(identity.symbolId, binding);
    });
    if (call.arguments.some((argument) => this.context.ts.isSpreadElement(argument))) {
      issues.push(this.issue("parameter-binding", "partial", "Spread call arguments do not provide one exact parameter binding.", call, [this.proof("argument-binding", "The call contains a spread argument.", [call])]));
    }
    return { bindings, byKey, issues };
  }

  protected parameterBindingFor(identifier: TypeScript.Identifier, state: ProgramValueEvaluationState): ProgramValueParameterBinding | null {
    const identity = declarationIdentity(this.context, parameterDeclarationFor(this.context, identifier));
    return (identity && state.parameterBindings.get(identity.id)) || state.parameterBindings.get(sourceExpression(this.context, identifier).symbolId ?? "") || null;
  }

  protected resolution(
    expression: ProgramValueSourceExpression,
    kind: ProgramValueSummaryKind,
    status: ProgramValueSummaryStatus,
    resolvedExpression: ProgramValueSourceExpression | null,
    declaration: ProgramValueDeclarationIdentity | null,
    resolvedDeclaration: ProgramValueDeclarationIdentity | null,
    aliases: readonly ProgramValueAliasStep[],
    parameterBindings: readonly ProgramValueParameterBinding[],
    issues: readonly ProgramValueSummaryIssue[],
    proof: readonly ProgramValueProof[],
    callTarget: ProgramValueFunctionIdentity | null = null,
  ): ProgramValueInternalResolution {
    const resolvedKind: ProgramValueSummaryKind = callTarget
      ? "first-party-call"
      : resolvedExpression && this.context.ts.isObjectLiteralExpression(resolvedExpression.node)
        ? "object-literal"
      : resolvedExpression && isLiteralValue(this.context.ts, resolvedExpression.node)
        ? "literal"
        : resolvedExpression && isStaticSourceExpression(this.context.ts, resolvedExpression.node)
          ? "source-expression"
        : kind === "parameter"
            ? "parameter"
            : status === "proven" ? kind : "unsupported";
    return {
      terminal: resolvedExpression?.node ?? null,
      resolution: { status, confidence: status === "proven" ? "proven" : "partial", kind, resolvedKind, expression, resolvedExpression, declaration, resolvedDeclaration, callTarget, aliasChain: aliases, parameterBindings, issues, proof },
    };
  }

  protected unsupportedResolution(
    expression: ProgramValueSourceExpression,
    detail: string,
    node: TypeScript.Node,
    reason: ProgramValueSummaryIssue["reason"],
    declaration: ProgramValueDeclarationIdentity | null,
    resolvedDeclaration: ProgramValueDeclarationIdentity | null,
    aliases: readonly ProgramValueAliasStep[],
    parameterBindings: readonly ProgramValueParameterBinding[],
  ): ProgramValueInternalResolution {
    const issue = this.issue(reason, "unsupported", detail, node, [this.proof("partial-classification", detail, [node])]);
    return this.resolution(expression, aliases.length > 0 ? "immutable-alias" : "unsupported", "unsupported", sourceExpression(this.context, node as TypeScript.Expression), declaration, resolvedDeclaration, aliases, parameterBindings, [issue], issue.proof);
  }

  protected issue(
    reason: ProgramValueSummaryIssue["reason"],
    status: ProgramValueSummaryStatus,
    detail: string,
    node: TypeScript.Node | null,
    proof: readonly ProgramValueProof[],
  ): ProgramValueSummaryIssue {
    return { reason, status, detail, location: node ? proofLocation(this.context, node) : null, proof };
  }

  protected proof(kind: ProgramValueProof["kind"], detail: string, nodes: readonly TypeScript.Node[]): ProgramValueProof {
    return { kind, detail, locations: uniqueLocations(nodes.map((node) => proofLocation(this.context, node))) };
  }

  protected emptyTrace(status: ProgramValueSummaryStatus, issue: ProgramValueSummaryIssue): ProgramValueTrace {
    return { status, confidence: "partial", sourceExpression: null, steps: [], aliasChain: [], parameterBindings: [], issues: [issue], proof: issue.proof };
  }

  protected newState(): ProgramValueEvaluationState {
    return { budget: { ...this.options, callDepth: 0, returnBranches: 0, members: 0 }, activeCallDepth: 0, callStack: new Set(), aliasStack: new Set(), parameterStack: new Set(), parameterBindings: new Map() };
  }
}

function normalizeOptions(options: ProgramValueSummaryOptions): Required<ProgramValueSummaryOptions> {
  return {
    maxCallDepth: boundedOption(options.maxCallDepth, DEFAULT_PROGRAM_VALUE_SUMMARY_OPTIONS.maxCallDepth),
    maxReturnBranches: boundedOption(options.maxReturnBranches, DEFAULT_PROGRAM_VALUE_SUMMARY_OPTIONS.maxReturnBranches),
    maxMembers: boundedOption(options.maxMembers, DEFAULT_PROGRAM_VALUE_SUMMARY_OPTIONS.maxMembers),
    maxAliasDepth: boundedOption(options.maxAliasDepth, DEFAULT_PROGRAM_VALUE_SUMMARY_OPTIONS.maxAliasDepth),
  };
}

function boundedOption(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.floor(value));
}

function isLiteralValue(ts: typeof TypeScript, node: TypeScript.Expression): boolean {
  return ts.isLiteralExpression(node) || ts.isArrayLiteralExpression(node) || node.kind === ts.SyntaxKind.NullKeyword;
}

function isFunctionValue(ts: typeof TypeScript, node: TypeScript.Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isStaticSourceExpression(ts: typeof TypeScript, node: TypeScript.Expression): boolean {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) && Boolean(node.argumentExpression && ts.isLiteralExpression(node.argumentExpression));
}

function uniqueLocations(locations: readonly ProgramEvidenceLocation[]): readonly ProgramEvidenceLocation[] {
  return [...new Map(locations.map((location) => [locationKey(location), location])).values()];
}
