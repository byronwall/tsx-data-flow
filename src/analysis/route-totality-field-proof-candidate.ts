import type * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { exactCallbackReturnExpression } from "./program-callback-return";
import {
  accessorDeclaration,
  elementKindForExpression,
  parameterPropertyReads,
  resolvesArrayFind,
  sourceOrder,
  visitTypeScript,
} from "./route-totality-field-proof-ast";
import { componentConsumers, uniqueShowUse } from "./route-totality-field-proof-component";
import type { ExactComponentBoundary } from "./route-totality-field-proof-component-boundary";
import type { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { fieldProofTargetForConsumer, fieldProofTargetKey, type FieldProofTargetSelector } from "./route-totality-field-proof-policy";
import {
  componentBoundaryConsumersForTarget,
  compilerIdentityForNode,
  directConsumers,
  enclosingOwnerIdentity,
  type CandidateConsumer,
} from "./route-totality-field-proof-consumers";
import { importModule } from "./program-evidence-support";
import type { ProgramElement } from "./scope-seam";

export type FieldProofCandidate = {
  targetKey: string;
  target: FieldProofTargetSelector;
  componentIdentity: string | null;
  ownerIdentity: string | null;
  findCall: TypeScript.CallExpression;
  snapshotCall: ProgramElement;
  collectionField: ProgramElement;
  collectionElement: ProgramElement;
  parameter: ProgramElement;
  parameterValue: ProgramElement;
  predicateField: ProgramElement;
  predicateResult: ProgramElement;
  findResult: ProgramElement;
  returnExpression: ProgramElement;
  accessorCall: ProgramElement;
  showBinding: ProgramElement;
  currentParameter: ProgramElement;
  currentCall: ProgramElement;
  consumerField: ProgramElement;
  consumerValue: ProgramElement;
  binding: ProgramElement;
  occurrence: ProgramElement;
  definition: ProgramElement;
  renderTerminal: ProgramElement;
  directConsumer: boolean;
  consumerKind: "render" | "condition" | "handler";
  consumerLabel: string;
  boundary: ExactComponentBoundary | null;
  sourceField: ProgramElement | null;
  evidenceLabel?: string | null;
};

export function discoverFieldProofCandidates(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  index: RouteTotalityFieldProofIndex,
  target: FieldProofTargetSelector | undefined,
  cancellation: AnalysisCancellationToken,
): FieldProofCandidate[] {
  const checker = program.getTypeChecker();
  const candidates: FieldProofCandidate[] = [];
  for (const file of [...program.getSourceFiles()].sort((left, right) => left.fileName.localeCompare(right.fileName))) {
    cancellation.throwIfCancelled();
    if (file.isDeclarationFile) continue;
    visitTypeScript(ts, file, (node) => {
      if (!ts.isCallExpression(node)) return;
    candidates.push(...candidatesForFind(ts, checker, root, index, target, node, cancellation));
    });
  }
  return [...new Map(candidates.map((candidate) => [fullCandidateProofKey(candidate), candidate])).values()]
    .sort((left, right) => sourceOrder(left.findCall, right.findCall)
      || left.binding.id.localeCompare(right.binding.id));
}

function fullCandidateProofKey(candidate: FieldProofCandidate): string {
  return [
    candidate.targetKey,
    candidate.snapshotCall.id,
    candidate.collectionField.id,
    candidate.collectionElement.id,
    candidate.parameter.id,
    candidate.parameterValue.id,
    candidate.predicateField.id,
    candidate.predicateResult.id,
    candidate.findResult.id,
    candidate.returnExpression.id,
    candidate.accessorCall.id,
    candidate.showBinding.id,
    candidate.currentParameter.id,
    candidate.currentCall.id,
    candidate.consumerField.id,
    candidate.consumerValue.id,
    candidate.binding.id,
    candidate.occurrence.id,
    candidate.definition.id,
    candidate.renderTerminal.id,
    candidate.boundary?.binding.id ?? "",
    candidate.boundary?.receiver?.id ?? "",
    candidate.sourceField?.id ?? "",
  ].join("\0");
}

function candidatesForFind(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  index: RouteTotalityFieldProofIndex,
  target: FieldProofTargetSelector | undefined,
  findCall: TypeScript.CallExpression,
  cancellation: AnalysisCancellationToken,
): FieldProofCandidate[] {
  if (!ts.isPropertyAccessExpression(findCall.expression) || !ts.isIdentifier(findCall.expression.name)
    || !resolvesArrayFind(checker, findCall.expression.name) || findCall.arguments.length !== 1
    || !ts.isArrowFunction(findCall.arguments[0])) return [];
  const collectionAccess = findCall.expression.expression;
  if (!ts.isPropertyAccessExpression(collectionAccess) || !ts.isCallExpression(collectionAccess.expression)) return [];
  const callback = findCall.arguments[0];
  if (callback.parameters.length !== 1 || !ts.isIdentifier(callback.parameters[0].name)
    || callback.parameters[0].dotDotDotToken || callback.parameters[0].questionToken
    || callback.parameters[0].initializer) return [];
  const returned = exactCallbackReturnExpression(ts, callback);
  const parameterSymbol = checker.getSymbolAtLocation(callback.parameters[0].name);
  if (!returned || !parameterSymbol) return [];
  const predicateReads = parameterPropertyReads(ts, checker, returned, parameterSymbol);
  if (predicateReads.length !== 1) return [];
  const declaration = accessorDeclaration(ts, findCall);
  if (!declaration) return [];
  const accessorSymbol = checker.getSymbolAtLocation(declaration.name);
  const showUse = uniqueShowUse(ts, checker, declaration.getSourceFile(), accessorSymbol);
  if (!showUse) return [];
  const baseValues = {
    snapshotCall: index.element(collectionAccess.expression, "call"),
    collectionField: index.element(collectionAccess, "field-read"),
    collectionElement: index.element(collectionAccess, "collection-element"),
    parameter: index.element(callback.parameters[0].name, "parameter"),
    parameterValue: index.element(predicateReads[0].expression, "value"),
    predicateField: index.element(predicateReads[0], "field-read"),
    predicateResult: index.element(returned, "predicate-result"),
    findResult: index.element(findCall, "call-result"),
    returnExpression: index.element(findCall, "return-expression"),
    accessorCall: index.element(showUse.when, "call"),
    showBinding: index.element(showUse.opening, "show-binding"),
    currentParameter: index.element(showUse.render.parameters[0].name, "parameter"),
    renderTerminal: index.element(showUse.render, "render-terminal"),
  };
  if (Object.values(baseValues).some((value) => value === null)
    || target && (baseValues.collectionField?.fieldName !== target.collectionFieldName
      || baseValues.predicateField?.fieldName !== target.predicateFieldName)) return [];

  const boundaryConsumers = componentBoundaryConsumersForTarget(ts, checker, root, index, showUse.render, target);
  const scalarAliasProps = new Set(boundaryConsumers
    .filter((consumer) => consumer.boundary?.mode === "scalar-alias" && consumer.sourceField?.fieldName)
    .map((consumer) => `${consumer.boundary?.componentName}:${consumer.boundary?.propName}:${consumer.sourceField?.fieldName}`));
  const consumers: CandidateConsumer[] = [
    ...componentConsumers(ts, checker, root, showUse.render, showUse.parameter)
      .filter((consumer) => !scalarAliasProps.has(`${consumer.componentName}:${consumer.propName}:${consumer.access.name.text}`))
      .map((consumer) => {
      const binding = index.element(consumer.attribute, "component-prop-binding");
      const occurrence = index.element(consumer.opening, "component-occurrence");
      const definitionId = binding?.componentBinding?.componentDefinitionId ?? null;
      return {
        access: consumer.access,
        call: consumer.call,
        value: consumer.value,
        valueElement: index.element(consumer.value, elementKindForExpression(ts, consumer.value)),
        binding,
        occurrence,
        definition: definitionId ? index.byId(definitionId) : null,
        componentName: consumer.componentName,
        componentIdentity: compilerIdentityForNode(ts, checker, consumer.opening.tagName),
        ownerIdentity: enclosingOwnerIdentity(ts, checker, showUse.render),
        tagModule: importModule(ts, checker, consumer.opening.tagName),
        propName: consumer.propName,
        kind: consumer.kind,
        direct: false,
        boundary: null,
        sourceField: null,
        evidenceLabel: typeof binding?.attributes?.label === "string" ? binding.attributes.label : null,
        terminal: null,
      };
    }),
    ...directConsumers(ts, checker, root, index, showUse.render, showUse.parameter),
    ...boundaryConsumers,
  ];
  return consumers.flatMap((consumer) => {
    if (target && !matchesTarget(consumer, target)) return [];
    const consumerField = index.element(consumer.access, "field-read");
    if (!consumerField || target && consumerField.fieldName !== target.consumerFieldName) return [];
    const currentCall = index.element(consumer.call, "call");
    if (!currentCall) return [];
    const targetSelector = target ?? genericTargetForConsumer(baseValues.collectionField!, baseValues.predicateField!, consumer, consumerField.fieldName!);
    const common = {
      targetKey: fieldProofTargetKey(targetSelector),
      target: targetSelector,
      ...baseValues,
      currentCall,
      componentIdentity: consumer.componentIdentity,
      ownerIdentity: consumer.ownerIdentity,
      consumerField,
      consumerValue: consumer.valueElement,
      binding: consumer.binding,
      occurrence: consumer.occurrence,
      definition: consumer.definition,
      directConsumer: consumer.direct,
      consumerKind: targetSelector.consumer.kind,
      consumerLabel: targetSelector.consumer.label,
      boundary: consumer.boundary,
      sourceField: consumer.sourceField,
      renderTerminal: consumer.terminal ?? baseValues.renderTerminal,
    };
    if (!common.consumerValue || !common.binding || !common.occurrence || !common.definition) {
      return [];
    }
    const occurrence = common.occurrence;
    const binding = common.binding;
    const definition = common.definition;
    if (consumer.direct) {
      if (occurrence.kind !== "component-definition") return [];
    } else {
      if (!occurrence.symbol || binding.componentBinding?.componentOccurrenceElementId !== occurrence.id) return [];
      const definitionId = binding.componentBinding?.componentDefinitionId;
      if (!definitionId || definition.id !== definitionId || definition.kind !== "component-definition") return [];
      if (definition.symbol !== occurrence.symbol) return [];
    }
    cancellation.throwIfCancelled();
    return [{ findCall, ...common } as FieldProofCandidate];
  });
}

function genericTargetForConsumer(
  collectionField: ProgramElement,
  predicateField: ProgramElement,
  consumer: CandidateConsumer,
  consumerFieldName: string,
): FieldProofTargetSelector {
  const boundary = consumer.boundary;
  const attributes = consumer.binding?.attributes ?? {};
  const label = genericConsumerLabel(consumer, consumerFieldName);
  const selector: FieldProofTargetSelector["consumer"] = {
    kind: consumer.kind,
    label,
    directConsumer: consumer.direct,
  };
  if (consumer.kind === "handler") {
    if (typeof attributes.actionName === "string") selector.actionName = attributes.actionName;
    if (typeof attributes.argumentName === "string") selector.argumentName = attributes.argumentName;
    if (typeof attributes.handlerReceiverName === "string") selector.handlerReceiverName = attributes.handlerReceiverName;
  } else if (boundary) {
    if (consumer.kind === "render" && consumer.componentName) {
      selector.tagName = consumer.componentName;
      selector.tagModule = consumer.componentName === "Text" && consumer.tagModule === "~/components/ui"
        ? "~/components/ui/text" : consumer.tagModule ?? undefined;
      selector.propName = consumer.propName ?? undefined;
    }
  } else if (consumer.direct) {
    if (consumer.componentName === "A" || consumer.componentName === "Show") selector.tagName = consumer.componentName;
    else if (consumer.componentName) selector.componentName = consumer.componentName;
    selector.tagModule = consumer.tagModule ?? undefined;
    selector.propName = consumer.propName ?? undefined;
  } else {
    selector.componentName = consumer.componentName ?? undefined;
    selector.propName = consumer.propName ?? undefined;
    selector.tagModule = consumer.tagModule ?? undefined;
  }
  if (!boundary) {
    if (typeof attributes.conditionOperator === "string") selector.conditionOperator = attributes.conditionOperator;
    if (typeof attributes.conditionLiteral === "string") selector.conditionLiteral = attributes.conditionLiteral;
    if (consumer.componentName === "Show" && typeof attributes.nestedShow === "boolean") selector.nestedShow = attributes.nestedShow;
  }
  if (typeof attributes.consumerCollection === "string") selector.collectionName = attributes.consumerCollection;
  return fieldProofTargetForConsumer({
    collectionFieldName: collectionField.fieldName!,
    predicateFieldName: predicateField.fieldName!,
    consumerFieldName,
    chain: boundary?.mode,
    componentName: boundary?.componentName ?? null,
    componentPropName: boundary?.propName ?? null,
    consumer: selector,
  });
}

function genericConsumerLabel(consumer: CandidateConsumer, fieldName: string): string {
  const attributes = consumer.binding?.attributes ?? {};
  if (consumer.kind === "handler" && typeof attributes.actionName === "string") {
    return `${attributes.actionName}.${attributes.argumentName ?? fieldName}`;
  }
  const collection = typeof attributes.consumerCollection === "string" ? attributes.consumerCollection : null;
  if (consumer.boundary) {
    if (consumer.kind === "condition") {
      if (collection === "schedules") return "Completed schedule gameId condition";
      if (collection === "availability") return consumer.boundary.componentName === "ScheduledGamePlanningDetails"
        ? "Scheduled availability gameId condition" : "Completed availability gameId condition";
      if (collection === "liveGames") return "Completed live gameId condition";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "CompletedGameSummary"
      && consumer.componentName === "A") return "Completed A.href live";
    if (consumer.kind === "render" && consumer.boundary.componentName === "ScheduledGamePlanningDetails") {
      return fieldName === "venueName" ? "ScheduledGamePlanningDetails venue" : "ScheduledGamePlanningDetails address";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "ProjectDetails" && fieldName === "ownerName") {
      return "ProjectDetails owner";
    }
    if (consumer.kind === "render" && consumer.boundary.componentName === "PageHeader" && consumer.boundary.propName === "title") {
      return "PageHeader.title";
    }
  }
  if (consumer.componentName === "PageHeader" && consumer.propName === "description") {
    if (fieldName === "startsAt") return "PageHeader.description date";
    if (fieldName === "venueName") return "PageHeader.description venue";
  }
  if (consumer.componentName === "PageHeader" && consumer.propName === "eyebrow" && consumer.kind === "condition") {
    return "PageHeader.eyebrow condition";
  }
  if (consumer.componentName === "A" && consumer.propName === "href") return "A.href schedule";
  if (consumer.componentName === "Show" && consumer.kind === "condition") {
    if (attributes.nestedShow === true) return "Show.when build actions";
    if (attributes.conditionOperator === "===") return "Show.when completed branch";
    return "Show.when edit action";
  }
  return consumer.evidenceLabel ?? `${consumer.componentName ?? "component"}.${consumer.propName ?? fieldName}`;
}

function matchesTarget(consumer: CandidateConsumer, target: FieldProofTargetSelector): boolean {
  const selector = target.consumer;
  if (consumer.kind !== selector.kind || consumer.direct !== selector.directConsumer) return false;
  if (selector.componentName && (target.chain && target.chain !== "direct"
    ? consumer.boundary?.componentName !== selector.componentName : consumer.componentName !== selector.componentName)) return false;
  if (selector.propName && consumer.propName !== selector.propName) return false;
  if (selector.tagName && consumer.componentName !== selector.tagName) return false;
  if (selector.tagModule && (!target.chain || target.chain === "direct") && consumer.tagModule !== selector.tagModule) return false;
  if (consumer.direct) {
    const attrs = consumer.binding?.attributes ?? {};
    if (selector.actionName !== undefined && attrs.actionName !== selector.actionName) return false;
    if (selector.argumentName !== undefined && attrs.argumentName !== selector.argumentName) return false;
    if (selector.handlerReceiverName !== undefined && attrs.handlerReceiverName !== selector.handlerReceiverName) return false;
    if (selector.conditionOperator !== undefined && attrs.conditionOperator !== selector.conditionOperator) return false;
    if (selector.conditionLiteral !== undefined && attrs.conditionLiteral !== selector.conditionLiteral) return false;
    if (selector.nestedShow !== undefined && attrs.nestedShow !== selector.nestedShow) return false;
    if (selector.collectionName !== undefined && attrs.consumerCollection !== selector.collectionName) return false;
  }
  return true;
}
