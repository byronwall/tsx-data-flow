import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import type {
  ContextDeclarationRecord,
  ContextProvidedValueRecord,
  ContextProviderOccurrenceRecord,
} from "./context-continuity";
import type { RouteRenderOccurrence } from "./route-occurrence-surface";
import type { SourceLocation } from "./scope-seam";
import {
  contextDeclarationId,
  jsxAncestorDepth,
  proof,
  stableId,
  uniqueLocations,
} from "./solid-route-context-continuity-route-support";
import {
  locationForContextNode as sourceLocationForContextNode,
  locationKey,
  staticValueShape,
  type SolidContextDeclaration,
  type SolidProviderSyntax,
} from "./solid-route-context-continuity-support";

export type ContextDeclarationBuild = {
  syntax: SolidContextDeclaration;
  record: ContextDeclarationRecord;
  defaultValue: ContextProvidedValueRecord | null;
};

export type ProviderSite = {
  context: SolidContextDeclaration;
  syntax: SolidProviderSyntax;
  host: RouteRenderOccurrence;
  occurrence: ContextProviderOccurrenceRecord;
  value: ContextProvidedValueRecord;
  elementLocation: SourceLocation;
  nestingDepth: number;
};

export function buildContextDeclarations(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  declarations: ReadonlyMap<string, SolidContextDeclaration>,
): ContextDeclarationBuild[] {
  return [...declarations.values()]
    .sort((left, right) => left.compilerIdentity.localeCompare(right.compilerIdentity))
    .map((syntax) => {
      const defaultValue = staticDefaultValue(ts, checker, root, syntax);
      const record: ContextDeclarationRecord = {
        id: contextDeclarationId(syntax),
        compilerIdentity: syntax.compilerIdentity,
        sourceIdentity: syntax.sourceIdentity,
        label: syntax.label,
        location: sourceLocationForContextNode(root, syntax.declaration),
        defaultValueId: defaultValue?.id ?? null,
        status: "proven",
        proof: proof(
          "compiler-symbol",
          `The compiler resolves ${syntax.label} to one Solid createContext declaration.`,
          [sourceLocationForContextNode(root, syntax.declaration), sourceLocationForContextNode(root, syntax.createContextCall)],
          "proven",
        ),
      };
      return { syntax, record, defaultValue };
    });
}

export function buildProviderSites(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  providerSyntaxes: readonly SolidProviderSyntax[],
  declarations: readonly ContextDeclarationBuild[],
  cancellation: AnalysisCancellationToken,
  occurrencesForNode: (node: TypeScript.Node) => RouteRenderOccurrence[],
  addOwnershipGap: (context: SolidContextDeclaration, node: TypeScript.Node, label: string) => void,
): ProviderSite[] {
  const declarationIds = new Map(declarations.map((item) => [item.syntax.compilerIdentity, item.record.id]));
  const providers: ProviderSite[] = [];
  const orderedSyntaxes = [...providerSyntaxes].sort((left, right) =>
    locationKey(sourceLocationForContextNode(root, left.opening)).localeCompare(locationKey(sourceLocationForContextNode(root, right.opening))),
  );
  for (const syntax of orderedSyntaxes) {
    cancellation.throwIfCancelled();
    const contextId = declarationIds.get(syntax.context.compilerIdentity);
    if (!contextId) continue;
    const hosts = occurrencesForNode(syntax.node);
    if (hosts.length === 0) {
      addOwnershipGap(syntax.context, syntax.opening, "Provider occurrence has no compiler-proven route component owner.");
      continue;
    }
    for (const host of hosts) {
      const openingLocation = sourceLocationForContextNode(root, syntax.opening);
      const providerId = stableId("context-provider", [contextId, host.id, locationKey(openingLocation)]);
      const valueId = stableId("context-value", [providerId, locationKey(sourceLocationForContextNode(root, syntax.valueExpression ?? syntax.opening))]);
      const shape = staticValueShape(ts, checker, syntax.valueExpression);
      const valueLocation = sourceLocationForContextNode(root, syntax.valueExpression ?? syntax.opening);
      const value: ContextProvidedValueRecord = {
        id: valueId,
        contextDeclarationId: contextId,
        providerOccurrenceId: providerId,
        sourceKind: "provider",
        expression: syntax.valueExpression?.getText(syntax.valueExpression.getSourceFile()) ?? "<missing value>",
        location: valueLocation,
        memberNames: shape.memberNames,
        memberCertainty: shape.memberCertainty,
        status: syntax.valueExpression ? shape.status : "unsupported",
        proof: syntax.valueExpression
          ? proof(
            "ast-node",
            "The Provider value is a source-backed expression at this exact render occurrence.",
            uniqueLocations([valueLocation, ...shape.proofNodes.map((node) => sourceLocationForContextNode(root, node))]),
            shape.status,
          )
          : proof(
            "jsx-tag",
            "The Provider occurrence has no statically visible value expression.",
            [openingLocation],
            "unsupported",
          ),
      };
      const occurrence: ContextProviderOccurrenceRecord = {
        id: providerId,
        contextDeclarationId: contextId,
        renderOccurrenceId: host.id,
        ownership: host.ownership,
        repetition: host.repetition,
        location: openingLocation,
        valueId,
        status: syntax.valueExpression ? value.status : "unsupported",
        proof: proof(
          "parent-occurrence",
          `The Provider is owned by route render occurrence ${host.id}.`,
          [openingLocation, host.callSite],
          syntax.valueExpression ? value.status : "unsupported",
        ),
      };
      providers.push({
        context: syntax.context,
        syntax,
        host,
        occurrence,
        value,
        elementLocation: sourceLocationForContextNode(root, syntax.node),
        nestingDepth: jsxAncestorDepth(ts, syntax.node),
      });
    }
  }
  return providers.sort((left, right) => left.occurrence.id.localeCompare(right.occurrence.id));
}

function staticDefaultValue(
  ts: typeof TypeScript,
  checker: TypeScript.TypeChecker,
  root: string,
  context: SolidContextDeclaration,
): ContextProvidedValueRecord | null {
  if (!context.defaultExpression) return null;
  const shape = staticValueShape(ts, checker, context.defaultExpression);
  if (shape.status !== "proven") return null;
  const contextId = contextDeclarationId(context);
  const location = sourceLocationForContextNode(root, context.defaultExpression);
  return {
    id: stableId("context-default", [contextId, locationKey(location)]),
    contextDeclarationId: contextId,
    providerOccurrenceId: null,
    sourceKind: "default",
    expression: context.defaultExpression.getText(context.defaultExpression.getSourceFile()),
    location,
    memberNames: shape.memberNames,
    memberCertainty: shape.memberCertainty,
    status: shape.status,
    proof: proof(
      "return-expression",
      "The createContext call has one statically proven default expression.",
      [location, sourceLocationForContextNode(root, context.createContextCall)],
      shape.status,
    ),
  };
}
