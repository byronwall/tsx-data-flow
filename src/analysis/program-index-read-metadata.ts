import type * as TypeScript from "typescript";
import type { ProgramElement } from "./program-evidence";
import type { ProgramIndexReadMetadata } from "./scope-seam";

export type IndexReadAttributes = {
  operation: "index-read";
  indexKind: "string-literal" | "numeric-literal" | "dynamic";
  indexValue: string | null;
};

/** Store only the raw literal class and literal text for an element read. */
export function indexReadAttributes(
  ts: typeof TypeScript,
  node: TypeScript.ElementAccessExpression,
): IndexReadAttributes {
  const argument = node.argumentExpression;
  if (node.questionDotToken) return dynamicIndexReadAttributes();
  if (argument && ts.isStringLiteral(argument)) {
    return {
      operation: "index-read",
      indexKind: "string-literal",
      indexValue: argument.text,
    };
  }
  if (argument && ts.isNumericLiteral(argument)) {
    return {
      operation: "index-read",
      indexKind: "numeric-literal",
      indexValue: argument.getText(node.getSourceFile()),
    };
  }
  return dynamicIndexReadAttributes();
}

export function dynamicIndexReadAttributes(): IndexReadAttributes {
  return {
    operation: "index-read",
    indexKind: "dynamic",
    indexValue: null,
  };
}

/** Normalize raw collector metadata without consulting display text. */
export function indexReadMetadataFromElement(
  element: Pick<ProgramElement, "kind" | "attributes">,
): ProgramIndexReadMetadata | null {
  if (element.kind !== "index-read") return null;
  const attributes = element.attributes;
  if (attributes.operation !== "index-read") return null;
  const kind = attributes.indexKind;
  const value = attributes.indexValue;
  if ((kind === "string-literal" || kind === "numeric-literal") && typeof value === "string") {
    return { kind, value };
  }
  if (kind === "dynamic" && value === null) return { kind, value: null };
  return null;
}
