import type { RouteOccurrenceDefinition } from "./route-occurrence-surface";
import type { RouteOccurrenceSurfaceBuilder } from "./route-occurrence-surface-builder";

const KNOWN_WRAPPER_MODULES = new Set(["styled-system/jsx", "@styled-system/jsx"]);
const KNOWN_WRAPPER_NAMES = new Set(["Box", "Flex", "Grid", "HStack", "Stack", "VStack"]);

export function isTransparentWrapper(builder: RouteOccurrenceSurfaceBuilder, definition: RouteOccurrenceDefinition) {
  if (!KNOWN_WRAPPER_NAMES.has(definition.name) || !KNOWN_WRAPPER_MODULES.has(definition.importModule ?? "")) return false;
  if (definition.external) return true;
  const declaration = builder.renderDeclarationFor(definition);
  if (!declaration) return false;
  const text = declaration.getText();
  return /\.children\b|\bchildren\b/.test(text) && !/(?:createResource|createSignal|createStore|useContext|createContext)\s*\(/.test(text);
}
