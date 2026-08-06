import { performance } from "node:perf_hooks";
import type { CompactProgramFact } from "./program-evidence-compact-facts";
import {
  readProgramEvidenceMemory,
} from "./program-evidence-collector-instrumentation";
import type {
  DeclarationCatalogFunctionInfo,
  DeclarationCatalogIdEntry,
  ProgramEvidenceDeclarationCatalogImportStats,
  ProgramEvidenceDeclarationCatalogView,
} from "./program-evidence-declaration-catalog";

export type DeclarationCatalogImportTarget = {
  facts: CompactProgramFact[];
  functionsByNode: Map<string, DeclarationCatalogFunctionInfo>;
  functionsBySymbol: Map<string, DeclarationCatalogFunctionInfo>;
  functionsById: Map<string, DeclarationCatalogFunctionInfo>;
  parametersBySymbol: Map<string, string>;
  variablesBySymbol: Map<string, string>;
  resourceBySymbol: Map<string, string>;
  returnsByFunction: Map<string, string[]>;
  elementIdsByNodeKind: Map<string, string>;
};

export function importProgramEvidenceDeclarationCatalog(
  target: DeclarationCatalogImportTarget,
  catalog: ProgramEvidenceDeclarationCatalogView,
  profilingEnabled: boolean,
): { declarationFactEnd: number; stats: ProgramEvidenceDeclarationCatalogImportStats } {
  const started = performance.now();
  const memoryStart = profilingEnabled ? readProgramEvidenceMemory() : null;
  target.facts.push(...catalog.declarationFacts);
  for (const [key, info] of catalog.functionsByNode) target.functionsByNode.set(key, info);
  for (const [key, info] of catalog.functionsBySymbol) target.functionsBySymbol.set(key, info);
  for (const [key, info] of catalog.functionsById) target.functionsById.set(key, info);
  copyIds(target.parametersBySymbol, catalog.parametersBySymbol);
  copyIds(target.variablesBySymbol, catalog.variablesBySymbol);
  copyIds(target.resourceBySymbol, catalog.resourceBySymbol);
  for (const [key, entries] of catalog.returnsByFunction) {
    target.returnsByFunction.set(key, entries.map((entry) => entry.id));
  }
  copyIds(target.elementIdsByNodeKind, catalog.elementIdsByNodeKind);
  const memoryEnd = profilingEnabled ? readProgramEvidenceMemory() : null;
  return {
    declarationFactEnd: target.facts.length,
    stats: {
      ...catalog.stats,
      importedEntries: catalog.stats.catalogEntries,
      skippedDeclarationFiles: catalog.sourceFiles.length,
      skippedDeclarationAstUnits: [...catalog.declarationAstUnitsByFile.values()].reduce((total, count) => total + count, 0),
      importElapsedMs: profilingEnabled ? performance.now() - started : 0,
      importMemoryStart: memoryStart,
      importMemoryEnd: memoryEnd,
    },
  };
}

function copyIds(target: Map<string, string>, source: ReadonlyMap<string, DeclarationCatalogIdEntry>): void {
  for (const [key, entry] of source) target.set(key, entry.id);
}
