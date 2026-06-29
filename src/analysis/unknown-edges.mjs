import { reachedSinkDescriptor } from "./sink-descriptor.mjs";

const REACHED_VIA_CAP = 50;

export function buildUnknownEdgeRows(graph, sinks) {
  const nodes = new Map((graph.nodes ?? []).map((node) => [node.id, node]));
  const byKey = new Map();
  const rows = [];
  const record = (key, build) => {
    const existing = byKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      return;
    }
    const row = { ...build(), occurrences: 1 };
    byKey.set(key, row);
    rows.push(row);
  };
  for (const edge of graph.edges ?? []) {
    if (!edge.unknown) continue;
    const target = nodes.get(edge.to);
    const source = nodes.get(edge.from);
    const file = target?.file ?? source?.file ?? "";
    const line = target?.location?.line ?? source?.location?.line ?? null;
    const label = target?.label ?? source?.label ?? edge.kind;
    record(`${file}:${line ?? ""}:${edge.kind}:${label}`, () => ({
      id: edge.id,
      file,
      line,
      kind: edge.kind,
      label,
      source: source
        ? { id: source.id, kind: source.kind, label: source.label }
        : null,
      target: target
        ? { id: target.id, kind: target.kind, label: target.label }
        : null,
      affectedSinks: affectedSinksForUnknownEdge(sinks, {
        file,
        line,
        kind: edge.kind,
        label,
      }),
    }));
  }
  for (const node of graph.nodes ?? []) {
    if (node.kind !== "unknown-source") continue;
    const file = node.file ?? "";
    const line = node.location?.line ?? null;
    const label = node.label;
    const kind = "unknown-source";
    record(`${file}:${line ?? ""}:${kind}:${label}`, () => ({
      id: node.id,
      file,
      line,
      kind,
      label,
      source: null,
      target: { id: node.id, kind: node.kind, label: node.label },
      affectedSinks: affectedSinksForUnknownEdge(sinks, {
        file,
        line,
        kind,
        label,
      }),
    }));
  }
  return rows.sort(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      Number(left.line ?? 0) - Number(right.line ?? 0) ||
      left.kind.localeCompare(right.kind) ||
      left.label.localeCompare(right.label),
  );
}

function affectedSinksForUnknownEdge(sinks, edge) {
  return sinks
    .filter((sink) => {
      const roots =
        sink.rootInfos ??
        sink.roots.map((root) => ({ label: root, kind: "source" }));
      if (
        roots.some(
          (root) => root.label === edge.label && root.kind === edge.kind,
        )
      ) {
        return true;
      }
      return (sink.representativeSteps ?? []).some((step) => {
        if (edge.file && step.file !== edge.file) return false;
        if (edge.line != null && step.line !== edge.line) return false;
        if (edge.kind && step.kind !== edge.kind) return false;
        return !edge.label || step.label === edge.label;
      });
    })
    .slice(0, REACHED_VIA_CAP)
    .map(reachedSinkDescriptor);
}
