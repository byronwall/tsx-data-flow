import type { FindingDetail } from "../../../api/contracts";

type Identity = FindingDetail["identity"];

export function identitySymbolLabel(identity: Identity) {
  if (identity.symbolName && isModulePathSymbol(identity.symbolName)) return identity.focusText || identity.expression;
  return identity.symbolName ?? "unresolved";
}

export function identityTypeLabel(identity: Identity) {
  if (!isModulePathSymbol(identity.symbolName)) return identity.typeText;
  if (/^typeof import\(["'][^"']+["']\)$/.test(identity.typeText)) return `typeof ${identity.focusText || identity.expression}`;
  return identity.typeText;
}

function isModulePathSymbol(symbolName: string | null): symbolName is string {
  return Boolean(symbolName && /^['"][^'"]+['"]$/.test(symbolName));
}
