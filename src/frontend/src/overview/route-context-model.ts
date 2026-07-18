import type { RouteDataDetail } from "../../../api/contracts";

export type RouteContextNode = RouteDataDetail["context"]["nodes"][number];
export type RouteContextBranch = { node: RouteContextNode; children: RouteContextBranch[] };
export type RouteTerminalGroup = { label: string; terminals: RouteContextNode[] };

export function routeComponentHierarchy(nodes: RouteContextNode[]): RouteContextBranch[] {
  const components = nodes.filter((node) => node.kind === "component");
  const byParent = new Map<string | null, RouteContextNode[]>();
  const componentIds = new Set(components.map((node) => node.id));
  for (const component of components) {
    const parentId = component.parentId && componentIds.has(component.parentId) ? component.parentId : null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), component]);
  }
  const branch = (node: RouteContextNode): RouteContextBranch => ({
    node,
    children: sortNodes(byParent.get(node.id) ?? []).map(branch),
  });
  return sortNodes(byParent.get(null) ?? []).map(branch);
}

export function routeTerminalGroups(nodes: RouteContextNode[], terminals: RouteDataDetail["terminals"]): RouteTerminalGroup[] {
  const terminalDetails = new Map(terminals.map((terminal) => [terminal.id, terminal]));
  const groups = new Map<string, RouteContextNode[]>();
  for (const node of nodes.filter((item) => item.kind === "terminal")) {
    const terminal = terminalDetails.get(node.id);
    const label = terminal?.component || filename(node.file) || "Unknown component";
    groups.set(label, [...(groups.get(label) ?? []), node]);
  }
  return [...groups.entries()]
    .map(([label, grouped]) => ({ label, terminals: sortNodes(grouped) }))
    .sort((left, right) => lexical(left.label, right.label));
}

function sortNodes(nodes: RouteContextNode[]) {
  return [...nodes].sort((left, right) => (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) || lexical(left.label, right.label));
}
function filename(file: string | null) { return file?.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? null; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
