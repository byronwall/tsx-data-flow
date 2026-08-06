import path from "node:path";
import type * as TypeScript from "typescript";
import {
  compactFactBytes,
  type CompactFactLocation,
  type CompactProgramFact,
} from "./program-evidence-compact-facts";
import type {
  EvidenceConfidence,
  ProgramElementKind,
  ProgramRelationKind,
  ProgramProofKind,
} from "./program-evidence";

export type DeclarationCatalogFunctionInfo = {
  declaration: TypeScript.FunctionLikeDeclaration;
  id: string;
  symbolId: string | null;
  name: string;
  sourceFile: TypeScript.SourceFile;
  kind: ProgramElementKind;
  component: boolean;
  handler: boolean;
};

export type DeclarationCatalogIdEntry = {
  id: string;
  sourceFile: string;
};

/** Compact declaration relation data. It retains spans, not expanded proof objects. */
export type DeclarationCatalogRelation = {
  id: string;
  from: string;
  to: string;
  kind: ProgramRelationKind;
  evidence: readonly CompactFactLocation[];
  proofKind: ProgramProofKind;
  proofDetail: string;
  proofLocations: readonly CompactFactLocation[];
  confidence: EvidenceConfidence;
};

export type ProgramEvidenceDeclarationCatalogStats = {
  catalogEntries: number;
  catalogBytesEstimate: number;
};

export type ProgramEvidenceDeclarationCatalogImportStats = ProgramEvidenceDeclarationCatalogStats & {
  importedEntries: number;
  skippedDeclarationFiles: number;
  skippedDeclarationAstUnits: number;
  importElapsedMs: number;
  importMemoryStart: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  } | null;
  importMemoryEnd: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  } | null;
};

export type ProgramEvidenceDeclarationCatalogView = {
  sourceFiles: readonly string[];
  declarationFacts: readonly CompactProgramFact[];
  declarationRelations: readonly DeclarationCatalogRelation[];
  functionsByNode: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsBySymbol: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsById: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  parametersBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  variablesBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  resourceBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  returnsByFunction: ReadonlyMap<string, readonly DeclarationCatalogIdEntry[]>;
  elementIdsByNodeKind: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  declarationAstUnitsByFile: ReadonlyMap<string, number>;
  stats: ProgramEvidenceDeclarationCatalogStats;
};

export type ProgramEvidenceDeclarationCatalog = ProgramEvidenceDeclarationCatalogView & {
  forFiles(sourceFiles: ReadonlySet<string>): ProgramEvidenceDeclarationCatalogView;
};

export type ProgramEvidenceDeclarationCatalogSource = {
  root: string;
  sourceFiles: readonly string[];
  allFacts: readonly CompactProgramFact[];
  declarationFacts: readonly CompactProgramFact[];
  declarationRelations: readonly DeclarationCatalogRelation[];
  functionsByNode: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsBySymbol: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsById: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  parametersBySymbol: ReadonlyMap<string, string>;
  variablesBySymbol: ReadonlyMap<string, string>;
  resourceBySymbol: ReadonlyMap<string, string>;
  returnsByFunction: ReadonlyMap<string, readonly string[]>;
  elementIdsByNodeKind: ReadonlyMap<string, string>;
  declarationAstUnitsByFile: ReadonlyMap<string, number>;
};

export function createProgramEvidenceDeclarationCatalog(
  source: ProgramEvidenceDeclarationCatalogSource,
): ProgramEvidenceDeclarationCatalog {
  const catalog = createView({
    root: path.resolve(source.root),
    sourceFiles: [...source.sourceFiles],
    declarationFacts: source.declarationFacts,
    declarationRelations: source.declarationRelations,
    functionsByNode: new Map(source.functionsByNode),
    functionsBySymbol: new Map(source.functionsBySymbol),
    functionsById: new Map(source.functionsById),
    parametersBySymbol: idEntries(source.parametersBySymbol, source.declarationFacts),
    variablesBySymbol: idEntries(source.variablesBySymbol, source.declarationFacts),
    resourceBySymbol: idEntries(source.resourceBySymbol, source.allFacts),
    returnsByFunction: returnEntries(source.returnsByFunction, source.allFacts),
    elementIdsByNodeKind: idEntries(source.elementIdsByNodeKind, source.allFacts),
    declarationAstUnitsByFile: new Map(source.declarationAstUnitsByFile),
  });
  return {
    ...catalog,
    forFiles: (sourceFiles) => filterCatalog(catalog, sourceFiles),
  };
}

function filterCatalog(
  catalog: ProgramEvidenceDeclarationCatalogView & { root?: string },
  sourceFiles: ReadonlySet<string>,
): ProgramEvidenceDeclarationCatalogView {
  const include = (file: string) => sourceFiles.has(file);
  const functionsByNode = filterFunctions(catalog.functionsByNode, include, catalogRoot(catalog));
  const functionsBySymbol = filterFunctions(catalog.functionsBySymbol, include, catalogRoot(catalog));
  const functionsById = filterFunctions(catalog.functionsById, include, catalogRoot(catalog));
  const declarationFacts = catalog.declarationFacts.filter((fact) => include(fact.location.file));
  const declarationRelations = catalog.declarationRelations.filter((relation) => include(relation.evidence[0]?.file ?? ""));
  const parametersBySymbol = filterIds(catalog.parametersBySymbol, include);
  const variablesBySymbol = filterIds(catalog.variablesBySymbol, include);
  const resourceBySymbol = filterIds(catalog.resourceBySymbol, include);
  const returnsByFunction = new Map<string, readonly DeclarationCatalogIdEntry[]>();
  for (const [functionId, entries] of catalog.returnsByFunction) {
    const filtered = entries.filter((entry) => include(entry.sourceFile));
    if (filtered.length > 0) returnsByFunction.set(functionId, filtered);
  }
  const elementIdsByNodeKind = filterIds(catalog.elementIdsByNodeKind, include);
  const declarationAstUnitsByFile = new Map(
    [...catalog.declarationAstUnitsByFile].filter(([file]) => include(file)),
  );
  return createView({
    root: catalogRoot(catalog),
    sourceFiles: [...sourceFiles].filter((file) => catalog.sourceFiles.includes(file)),
    declarationFacts,
    declarationRelations,
    functionsByNode,
    functionsBySymbol,
    functionsById,
    parametersBySymbol,
    variablesBySymbol,
    resourceBySymbol,
    returnsByFunction,
    elementIdsByNodeKind,
    declarationAstUnitsByFile,
  });
}

function createView(input: {
  root: string;
  sourceFiles: readonly string[];
  declarationFacts: readonly CompactProgramFact[];
  declarationRelations: readonly DeclarationCatalogRelation[];
  functionsByNode: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsBySymbol: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsById: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  parametersBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  variablesBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  resourceBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  returnsByFunction: ReadonlyMap<string, readonly DeclarationCatalogIdEntry[]>;
  elementIdsByNodeKind: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  declarationAstUnitsByFile: ReadonlyMap<string, number>;
}): ProgramEvidenceDeclarationCatalogView & { root: string } {
  return {
    root: input.root,
    sourceFiles: input.sourceFiles,
    declarationFacts: input.declarationFacts,
    declarationRelations: input.declarationRelations,
    functionsByNode: input.functionsByNode,
    functionsBySymbol: input.functionsBySymbol,
    functionsById: input.functionsById,
    parametersBySymbol: input.parametersBySymbol,
    variablesBySymbol: input.variablesBySymbol,
    resourceBySymbol: input.resourceBySymbol,
    returnsByFunction: input.returnsByFunction,
    elementIdsByNodeKind: input.elementIdsByNodeKind,
    declarationAstUnitsByFile: input.declarationAstUnitsByFile,
    stats: catalogStats(input),
  };
}

function filterFunctions(
  values: ReadonlyMap<string, DeclarationCatalogFunctionInfo>,
  include: (file: string) => boolean,
  root: string,
): Map<string, DeclarationCatalogFunctionInfo> {
  return new Map(
    [...values].filter(([, info]) => include(relativeFile(root, info.sourceFile.fileName))),
  );
}

function filterIds(
  values: ReadonlyMap<string, DeclarationCatalogIdEntry>,
  include: (file: string) => boolean,
): Map<string, DeclarationCatalogIdEntry> {
  return new Map([...values].filter(([, entry]) => include(entry.sourceFile)));
}

function idEntries(
  values: ReadonlyMap<string, string>,
  facts: readonly CompactProgramFact[],
): Map<string, DeclarationCatalogIdEntry> {
  const sourceFiles = new Map(facts.map((fact) => [fact.id, fact.location.file]));
  return new Map(
    [...values]
      .filter(([, id]) => sourceFiles.has(id))
      .map(([key, id]) => [key, { id, sourceFile: sourceFiles.get(id) as string }]),
  );
}

function returnEntries(
  values: ReadonlyMap<string, readonly string[]>,
  facts: readonly CompactProgramFact[],
): Map<string, readonly DeclarationCatalogIdEntry[]> {
  const sourceFiles = new Map(facts.map((fact) => [fact.id, fact.location.file]));
  return new Map(
    [...values].map(([key, ids]) => [
      key,
      ids
        .filter((id) => sourceFiles.has(id))
        .map((id) => ({ id, sourceFile: sourceFiles.get(id) as string })),
    ]),
  );
}

function catalogStats(input: {
  declarationFacts: readonly CompactProgramFact[];
  declarationRelations: readonly DeclarationCatalogRelation[];
  functionsByNode: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsBySymbol: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  functionsById: ReadonlyMap<string, DeclarationCatalogFunctionInfo>;
  parametersBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  variablesBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  resourceBySymbol: ReadonlyMap<string, DeclarationCatalogIdEntry>;
  returnsByFunction: ReadonlyMap<string, readonly DeclarationCatalogIdEntry[]>;
  elementIdsByNodeKind: ReadonlyMap<string, DeclarationCatalogIdEntry>;
}): ProgramEvidenceDeclarationCatalogStats {
  const maps = [
    input.functionsByNode,
    input.functionsBySymbol,
    input.functionsById,
    input.parametersBySymbol,
    input.variablesBySymbol,
    input.resourceBySymbol,
    input.returnsByFunction,
    input.elementIdsByNodeKind,
  ];
  const catalogEntries = input.declarationFacts.length
    + input.declarationRelations.length
    + maps.reduce((total, map) => total + map.size, 0);
  let catalogBytesEstimate = input.declarationFacts.reduce((total, fact) => total + compactFactBytes(fact), 0);
  for (const map of maps) {
    for (const [key, value] of map) {
      catalogBytesEstimate += key.length * 2 + 32;
      catalogBytesEstimate += catalogValueBytes(value);
    }
  }
  for (const relation of input.declarationRelations) {
    catalogBytesEstimate += relation.id.length * 2 + relation.from.length * 2 + relation.to.length * 2;
    catalogBytesEstimate += relation.proofDetail.length * 2 + (relation.evidence.length + relation.proofLocations.length) * 48;
  }
  return { catalogEntries, catalogBytesEstimate };
}

function catalogValueBytes(value: unknown): number {
  if (typeof value === "string") return value.length * 2;
  if (Array.isArray(value)) return value.length * 48;
  if (value && typeof value === "object" && "id" in value && "sourceFile" in value) {
    const entry = value as DeclarationCatalogIdEntry;
    return entry.id.length * 2 + entry.sourceFile.length * 2;
  }
  return 128;
}

function catalogRoot(catalog: ProgramEvidenceDeclarationCatalogView & { root?: string }): string {
  return catalog.root ?? "";
}

function relativeFile(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}
