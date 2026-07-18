import type { RouteDataDetail } from "../../../api/contracts";

type RouteDataShape = RouteDataDetail["shapes"][number];

export function trajectoryShapeLabel(shape: RouteDataShape | null | undefined) {
  if (!shape) return "Unknown output";
  const preferred = usefulTypeName(shape.typeName) ? shape.typeName! : shape.typeText;
  const members = cleanCompilerType(preferred).split(/\s*\|\s*/).filter((member) => member !== "null" && member !== "undefined");
  return members.join(" | ") || cleanCompilerType(preferred) || "Unknown output";
}

export function trajectoryShapeMeta(shape: RouteDataShape | null | undefined) {
  if (!shape) return "Shape unavailable";
  const parts: string[] = [];
  if (shape.totalFields > 0) parts.push(`${shape.totalFields} field${shape.totalFields === 1 ? "" : "s"}`);
  else if (shape.kind === "collection") parts.push("collection");
  else if (shape.kind === "opaque") parts.push("shape unknown");
  const cleanType = cleanCompilerType(shape.typeText);
  const mayBeEmpty = /\b(?:null|undefined)\b/.test(cleanType);
  const concreteMembers = cleanType.split(/\s*\|\s*/).filter((member) => member !== "null" && member !== "undefined");
  if (shape.kind === "union" && concreteMembers.length > 1) parts.push(`${concreteMembers.length} possible shapes`);
  if (mayBeEmpty) parts.push("may be empty");
  return parts.join(" · ");
}

export function trajectoryShapeSummary(shape: RouteDataShape | null | undefined) {
  const meta = trajectoryShapeMeta(shape);
  return `${trajectoryShapeLabel(shape)}${meta ? ` · ${meta}` : ""}`;
}

export function cleanCompilerType(value: string) {
  return value
    .replace(/import\((?:"[^"]*"|'[^']*')\)\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulTypeName(value: string | null) {
  return Boolean(value && !["__type", "__object", "unknown"].includes(value));
}
