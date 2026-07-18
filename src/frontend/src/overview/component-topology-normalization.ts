import type { RouteDataDetail } from "../../../api/contracts";

const TRANSPARENT_SOLID_FLOW_COMPONENTS = new Set(["For", "Index", "Match", "Show", "Suspense", "Switch"]);

type RouteContextNode = RouteDataDetail["context"]["nodes"][number];
type RouteContextEdge = RouteDataDetail["context"]["edges"][number];

export function isTransparentSolidFlowComponent(node: RouteContextNode) {
  if (node.kind !== "component" || !isTransparentSolidFlowLabel(node.label)) return false;
  const file = node.file?.replaceAll("\\", "/") ?? "";
  return node.role === "framework" || file.includes("/solid-js/") && file.endsWith("/types/render/flow.d.ts");
}

export function isTransparentSolidFlowLabel(label: string) {
  return TRANSPARENT_SOLID_FLOW_COMPONENTS.has(label.split(".").at(-1) ?? label);
}

export function recursiveComponentOccurrenceIds(nodes: RouteContextNode[], edges: RouteContextEdge[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, string[]>();
  for (const edge of edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  const dedicated = new Set(nodes.filter((node) => node.id.startsWith("rendered-component-occurrence:")).map((node) => node.id));
  for (const node of nodes) {
    if (node.kind !== "component") continue;
    const queue = [...(incoming.get(node.id) ?? [])];
    const visited = new Set<string>();
    while (queue.length) {
      const ancestorId = queue.shift()!;
      if (visited.has(ancestorId)) continue;
      visited.add(ancestorId);
      const ancestor = nodeById.get(ancestorId);
      if (ancestor?.kind === "component" && ancestor.label === node.label) {
        dedicated.add(node.id);
        break;
      }
      queue.push(...(incoming.get(ancestorId) ?? []));
    }
  }
  return dedicated;
}

export function componentOccurrenceId(node: RouteContextNode) {
  return `component-occurrence:${cleanKey(node.id)}`;
}

export function resolveTransparentComponentTargets(
  startId: string,
  nodeById: Map<string, RouteContextNode>,
  edgesByFrom: Map<string, RouteContextEdge[]>,
) {
  const targets: Array<{ node: RouteContextNode; via: string[] }> = [];
  const visit = (nodeId: string, via: string[], visited: Set<string>) => {
    if (visited.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (node?.kind !== "component") return;
    if (!isTransparentSolidFlowComponent(node)) {
      targets.push({ node, via });
      return;
    }
    const nextVisited = new Set(visited).add(nodeId);
    for (const edge of edgesByFrom.get(nodeId) ?? []) {
      visit(edge.to, [...via, node.label], nextVisited);
    }
  };
  visit(startId, [], new Set());
  return targets;
}

export function contractTransparentComponentSteps(values: string[]) {
  const components: Array<{ label: string; via: string[] }> = [];
  let via: string[] = [];
  for (const label of compactAdjacent(values)) {
    if (isTransparentSolidFlowLabel(label)) {
      via = [...via, label];
      continue;
    }
    if (components.at(-1)?.label === label) {
      via = [];
      continue;
    }
    components.push({ label, via });
    via = [];
  }
  return components;
}

function compactAdjacent(values: string[]) {
  return values.filter((value, index) => value && value !== values[index - 1]);
}

function cleanKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
