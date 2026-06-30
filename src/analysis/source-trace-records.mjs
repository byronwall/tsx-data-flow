import path from "node:path";
import { addEdge, addNode, locationOf } from "./graph.mjs";
import { safeTypeText } from "./source-defenses.mjs";
import { collapse, focusSnippet, formatExpression } from "../reports/format-helpers.mjs";

// Representation-only hops: steps that repackage a value without changing it
// (aliases, object packs/spreads). Tracked so the report can list exactly which
// transforms it counts, and deduped per sink so a shared hop isn't counted once
// per render sub-path that crosses it.
const REPRESENTATION_KINDS = new Set(["alias", "object-pack", "object-spread"]);

export function addOperationTrace(ts, graph, kind, expression, traces, options = {}) {
  const explicit = options.label != null;
  const fullText = collapse(expression.getText());
  const nodeLabel = options.label ?? formatExpression(fullText);
  // A short gloss of what this step evaluates, for kinds whose label alone is
  // ambiguous (a helper/method/memo/alias name says nothing about its body).
  // Defaults to the full expression text for calls; explicit callers override.
  const detail = options.detail ?? null;
  // File + line of this hop, threaded onto the step so the path can show where
  // each piece of logic lives (same file vs. scattered) and an agent can grep it.
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label: nodeLabel,
    file,
    location,
    type: safeTypeText(options.type),
  });
  const edges = [];
  const rootInfos = [];
  const defenses = [];
  const representationSteps = [];
  // Packed objects the value flows through, so sinks sharing one packed object
  // (a createMemo/object literal) can be grouped and checked for over-packing
  // (Phase 3). Identity is the object literal's *source location*, NOT the graph
  // node id: the trace graph re-traces each sink, minting a fresh node per
  // object-pack, so node ids are never shared even for the same literal.
  const packs = [];
  // Each path step carries its operation kind so the transformation ledger and
  // path renderers can name the real operation (property-read, fallback, call,
  // object-pack, …) instead of a constant placeholder.
  let winnerChild = null;
  let longest = [{ label: nodeLabel, kind, detail, file, line: location.line }];
  for (const trace of traces.filter(Boolean)) {
    addEdge(
      graph,
      trace.lastNodeId,
      node.id,
      kind,
      expression,
      options.unknown,
    );
    edges.push(...trace.edges, kind);
    rootInfos.push(
      ...(trace.rootInfos ??
        trace.roots.map((root) => ({ label: root, kind: "source" }))),
    );
    defenses.push(...trace.defenses);
    representationSteps.push(...(trace.representationSteps ?? []));
    packs.push(...(trace.packs ?? []));
    if (trace.longestPath.length + 1 > longest.length) {
      winnerChild = trace;
      longest = [
        ...trace.longestPath,
        { label: nodeLabel, kind, detail, file, line: location.line },
      ];
    }
  }
  // Re-center an inline expression's label on the sub-expression that actually
  // flows in from the previous step (the "via"), marking it with « » so long
  // compute/pack/ternary expressions show the traced piece instead of
  // truncating an unrelated front. Steps with an explicit label (calls, memos,
  // reads) already carry their own gloss and keep their name.
  if (!explicit) {
    const focused = focusSnippet(fullText, winnerChild?.headText ?? null, 90);
    longest[longest.length - 1] = {
      ...longest[longest.length - 1],
      label: focused,
    };
  }
  if (kind === "object-pack") {
    packs.push({
      key: `${file}:${location.line}:${location.column}`,
      label: nodeLabel,
    });
  }
  if (REPRESENTATION_KINDS.has(kind)) {
    representationSteps.push({
      kind,
      label: nodeLabel,
      file,
      line: location.line,
      key: `${file}:${location.line}:${location.column}`,
    });
  }
  if (traces.length === 0)
    rootInfos.push({ label: nodeLabel, kind: "operation" });
  const dedupedRoots = uniqueRootInfos(rootInfos);
  return {
    lastNodeId: node.id,
    roots: dedupedRoots.map((root) => root.label),
    rootInfos: dedupedRoots,
    edges,
    defenses,
    representationSteps,
    longestPath: longest,
    packs: uniquePacks(packs),
    // The collapsed full text of this expression, so a parent operation can mark
    // exactly which sub-expression the traced value flowed in through.
    headText: fullText,
  };
}

// Deduplicate packs by their source-location key, keeping the first label seen.
function uniquePacks(packs) {
  const seen = new Map();
  for (const pack of packs) {
    if (!seen.has(pack.key)) seen.set(pack.key, pack);
  }
  return Array.from(seen.values());
}

// Deduplicate root descriptors by label, keeping the first (most specific)
// kind seen. Sources are tracked with their node kind so reports can filter
// out literal/primitive roots that are not actionable "sources".
function uniqueRootInfos(rootInfos) {
  const seen = new Map();
  for (const info of rootInfos) {
    if (!info || !info.label) continue;
    if (!seen.has(info.label)) seen.set(info.label, info);
  }
  return Array.from(seen.values());
}

// FANOUT-DEF-1: resolve a root expression to its DEFINITION location (where the
// symbol is declared), not the use site we are currently tracing. This lets the
// fan-out graph's source node link straight to where a shared source like
// `useCommitsTableContext` is defined — the user shouldn't have to click into a
// usage and chase an import. Best-effort: returns null when the symbol is
// unresolved or only declared externally (node_modules / `.d.ts`).
export function definitionLocationOf(ts, checker, expression, root) {
  let symbol;
  try {
    symbol = checker.getSymbolAtLocation(expression);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
      symbol = checker.getAliasedSymbol(symbol);
    }
  } catch {
    return null;
  }
  const declarations = symbol?.declarations ?? [];
  if (declarations.length === 0) return null;
  const internal = declarations.find((declaration) => {
    const file = declaration.getSourceFile();
    if (file.isDeclarationFile) return false;
    const relative = relativePath(root, file.fileName);
    return !relative.startsWith("..") && !relative.includes("node_modules/");
  });
  if (!internal) return null;
  const declFile = internal.getSourceFile();
  const position = declFile.getLineAndCharacterOfPosition(
    internal.getStart(declFile),
  );
  return {
    file: relativePath(root, declFile.fileName),
    line: position.line + 1,
  };
}

export function sourceTrace(
  graph,
  expression,
  kind,
  label,
  unknown,
  rootKind = kind,
  def = null,
) {
  const sourceFile = expression.getSourceFile();
  const file = relativePath(graph.root, sourceFile.fileName);
  const location = locationOf(sourceFile, expression);
  const node = addNode(graph, {
    kind,
    label,
    file,
    location,
    type: safeTypeText(),
  });
  return {
    lastNodeId: node.id,
    roots: [label],
    rootInfos: [{ label, kind: rootKind, ...(def ? { def } : {}) }],
    edges: [],
    defenses: [],
    representationSteps: [],
    longestPath: [{ label, kind, detail: null, file, line: location.line }],
    packs: [],
    unknown,
    headText: collapse(expression.getText()),
  };
}

function relativePath(root, file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}
