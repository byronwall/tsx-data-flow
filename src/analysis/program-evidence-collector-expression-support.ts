import * as TypeScript from "typescript";
import type {
  EvidenceConfidence,
  ProgramElementKind,
  ProgramEvidenceLocation,
  ProgramOperationKind,
  ProgramProof,
  ProgramRelationKind,
} from "./program-evidence";
import type {
  CollectorFunctionInfo,
  CollectorReferenceInfo,
} from "./program-evidence-collector-support";
import {
  calleeName,
  isSelectionOperator,
  proof,
  unwrap,
} from "./program-evidence-support";

type Attributes = Record<string, string | number | boolean | null>;

export function constructorExpressionElementEvidence(
  ts: typeof TypeScript,
  node: TypeScript.NewExpression,
  location: ProgramEvidenceLocation,
): { attributes: Attributes; proof: ProgramProof } {
  return {
    attributes: { callee: `new ${calleeName(ts, node.expression)}` },
    proof: proof(
      "ast-node",
      "The constructor expression is a source-backed invocation occurrence.",
      [location],
    ),
  };
}

export type ProgramEvidenceExpressionContext = {
  ts: typeof TypeScript;
  references: CollectorReferenceInfo[];
  parametersBySymbol: ReadonlyMap<string, string>;
  functionsBySymbol: ReadonlyMap<string, CollectorFunctionInfo>;
  symbolId: (node: TypeScript.Node) => string | null;
  moduleFor: (node: TypeScript.Node) => string | null;
  location: (node: TypeScript.Node) => ProgramEvidenceLocation;
  ensureElement: (
    node: TypeScript.Node,
    kind: ProgramElementKind,
    ownerId: string | null,
    attributes: Attributes,
    symbolId: string | null,
    module: string | null,
    definitionId: string | null,
    confidence: EvidenceConfidence,
    proofValue: ProgramProof,
    operationKind?: ProgramOperationKind | null,
  ) => string;
  addRelation: (
    from: string,
    to: string,
    kind: ProgramRelationKind,
    locations: ProgramEvidenceLocation[],
    proofValue: ProgramProof,
    confidence: EvidenceConfidence,
  ) => void;
};

export function collectProgramEvidenceExpression(
  context: ProgramEvidenceExpressionContext,
  node: TypeScript.Expression,
  ownerId: string | null,
): string {
  const unwrapped = unwrap(context.ts, node);
  if (context.ts.isNewExpression(unwrapped)) {
    const evidence = constructorExpressionElementEvidence(
      context.ts,
      unwrapped,
      context.location(unwrapped),
    );
    return context.ensureElement(
      unwrapped,
      "call",
      ownerId,
      evidence.attributes,
      context.symbolId(unwrapped.expression),
      context.moduleFor(unwrapped.expression),
      null,
      "proven",
      evidence.proof,
    );
  }
  if (context.ts.isCallExpression(unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "call",
      ownerId,
      { callee: calleeName(context.ts, unwrapped.expression) },
      context.symbolId(unwrapped.expression),
      context.moduleFor(unwrapped.expression),
      null,
      "proven",
      proof(
        "ast-node",
        "The expression is a source-backed invocation occurrence.",
        [context.location(unwrapped)],
      ),
    );
  }
  if (context.ts.isPropertyAccessExpression(unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "field-read",
      ownerId,
      { property: unwrapped.name.text },
      context.symbolId(unwrapped.name),
      context.moduleFor(unwrapped.name),
      null,
      "proven",
      proof(
        "property-access",
        "The property access is compiler-backed syntax.",
        [context.location(unwrapped)],
      ),
      "field-read",
    );
  }
  if (context.ts.isElementAccessExpression(unwrapped)) {
    return context.ensureElement(
      unwrapped,
      "index-read",
      ownerId,
      { operation: "index-read" },
      context.symbolId(unwrapped.expression),
      null,
      null,
      "proven",
      proof(
        "property-access",
        "The element access is source-backed syntax.",
        [context.location(unwrapped)],
      ),
      "index-read",
    );
  }
  if (
    context.ts.isObjectLiteralExpression(unwrapped) ||
    context.ts.isArrayLiteralExpression(unwrapped)
  ) {
    return context.ensureElement(
      unwrapped,
      "object-pack",
      ownerId,
      { operation: "object-pack" },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The expression packs source-backed values.",
        [context.location(unwrapped)],
      ),
      "object-pack",
    );
  }
  if (
    context.ts.isConditionalExpression(unwrapped) ||
    (context.ts.isBinaryExpression(unwrapped) &&
      isSelectionOperator(context.ts, unwrapped.operatorToken.kind))
  ) {
    const operator = context.ts.isConditionalExpression(unwrapped)
      ? "conditional"
      : unwrapped.operatorToken.getText(unwrapped.getSourceFile());
    return context.ensureElement(
      unwrapped,
      "selection",
      ownerId,
      { operator },
      null,
      null,
      null,
      "proven",
      proof(
        "ast-node",
        "The expression selects between values or branches.",
        [context.location(unwrapped)],
      ),
      "selection",
    );
  }
  if (context.ts.isIdentifier(unwrapped)) {
    const symbolId = context.symbolId(unwrapped);
    const id = context.ensureElement(
      unwrapped,
      "value",
      ownerId,
      { name: unwrapped.text },
      symbolId,
      context.moduleFor(unwrapped),
      null,
      "proven",
      proof(
        symbolId ? "compiler-symbol" : "ast-node",
        "The identifier is a source-backed value occurrence.",
        [context.location(unwrapped)],
      ),
    );
    context.references.push({ node: unwrapped, id, symbolId });
    const parameterId = context.parametersBySymbol.get(symbolId ?? "");
    if (parameterId) {
      context.addRelation(
        parameterId,
        id,
        "references",
        [context.location(unwrapped)],
        proof(
          "compiler-symbol",
          "The value occurrence resolves to a function parameter.",
          [context.location(unwrapped)],
        ),
        "proven",
      );
    }
    const functionTarget = context.functionsBySymbol.get(symbolId ?? "");
    if (functionTarget) {
      context.addRelation(
        id,
        functionTarget.id,
        "definition",
        [context.location(unwrapped)],
        proof(
          "compiler-symbol",
          "The value occurrence resolves to an in-project function.",
          [context.location(unwrapped)],
        ),
        "proven",
      );
    }
    return id;
  }
  return context.ensureElement(
    unwrapped,
    "literal",
    ownerId,
    { text: unwrapped.getText(unwrapped.getSourceFile()) },
    null,
    null,
    null,
    "proven",
    proof(
      "ast-node",
      "The expression is a source-backed literal or value.",
      [context.location(unwrapped)],
    ),
  );
}
