export function createGraph(root = process.cwd()) {
  return { nodes: [], edges: [], nextNodeId: 1, nextEdgeId: 1, root };
}

export function addNode(graph, node) {
  const record = { id: `n${graph.nextNodeId}`, ...node };
  graph.nextNodeId += 1;
  graph.nodes.push(record);
  return record;
}

export function addEdge(graph, from, to, kind, node, unknown = false) {
  if (!from || !to) return null;
  const record = {
    id: `e${graph.nextEdgeId}`,
    from,
    to,
    kind,
    unknown: Boolean(unknown),
    location: node ? locationOf(node.getSourceFile(), node) : null,
  };
  graph.nextEdgeId += 1;
  graph.edges.push(record);
  return record;
}

export function locationOf(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { line: position.line + 1, column: position.character + 1 };
}

// Full source span (start + end, 1-based line/column) of a node, so the code map
// can highlight exactly the chunk a finding maps to rather than the whole line.
export function spanOf(sourceFile, node) {
  const start = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

// Count DISTINCT unknown edges, keyed exactly as buildUnknownEdgeRows does. The
// graph re-traces each sink, minting fresh nodes/edges per render path, so a raw
// `graph.edges.filter(unknown).length` counts one physical unknown once per sink
// that crosses it — overstating the real figure many-fold. The summary/dossier
// must match the deduped report rows, so dedupe by source position + kind + label.
export function countDistinctUnknownEdges(graph) {
  const nodes = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const seen = new Set();
  for (const edge of graph.edges ?? []) {
    if (!edge.unknown) continue;
    const target = nodes.get(edge.to);
    const source = nodes.get(edge.from);
    const file = target?.file ?? source?.file ?? "";
    const line = target?.location?.line ?? source?.location?.line ?? null;
    const label = target?.label ?? source?.label ?? edge.kind;
    seen.add(`${file}:${line ?? ""}:${edge.kind}:${label}`);
  }
  for (const node of graph.nodes ?? []) {
    if (node.kind !== "unknown-source") continue;
    seen.add(
      `${node.file ?? ""}:${node.location?.line ?? ""}:unknown-source:${node.label}`,
    );
  }
  return seen.size;
}
