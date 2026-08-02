import type { ComponentTopology } from "./component-topology-model";
import type { HiddenComponentProjection, HiddenComponentRecord } from "./hidden-component-projection";

export type HiddenComponentInventoryItem = HiddenComponentRecord & {
  state: "hidden" | "revealed";
  parentIds: string[];
  parentLabel: string;
  parentLocation: string | null;
};

export type HiddenComponentInventoryGroup = {
  id: string;
  parentLabel: string;
  parentLocation: string | null;
  items: HiddenComponentInventoryItem[];
};

export function buildHiddenComponentInventory(
  topology: ComponentTopology,
  projection: HiddenComponentProjection,
  allMatches: HiddenComponentProjection,
  mode: "hidden" | "all",
  revealedComponentIds: ReadonlySet<string>,
) {
  if (mode === "all") return [];
  const activeById = new Map(projection.hidden.map((record) => [record.componentId, record]));
  const nodesById = new Map(topology.nodes.map((node) => [node.id, node]));
  const items = allMatches.hidden.flatMap((record): HiddenComponentInventoryItem[] => {
    const active = activeById.get(record.componentId);
    const state = active ? "hidden" : revealedComponentIds.has(record.componentId) ? "revealed" : null;
    if (!state) return [];
    const parentIds = uniqueStrings((active?.visibleParentIds ?? record.visibleParentIds).filter((id) => nodesById.has(id)));
    const parentNodes = parentIds.map((id) => nodesById.get(id)!).filter(Boolean);
    return [{
      ...record,
      state,
      parentIds,
      parentLabel: parentNodes.length ? parentNodes.map((node) => node.label).join(" · ") : "Route boundary",
      parentLocation: parentNodes.length ? parentNodes.map((node) => shortLocation(node.file, node.line)).join(" · ") : null,
    }];
  });
  const groups = new Map<string, HiddenComponentInventoryGroup>();
  for (const item of items) {
    const id = item.parentIds.join(",") || "route-boundary";
    const existing = groups.get(id);
    if (existing) existing.items.push(item);
    else groups.set(id, { id, parentLabel: item.parentLabel, parentLocation: item.parentLocation, items: [item] });
  }
  return [...groups.values()]
    .map((group) => ({ ...group, items: group.items.sort(inventorySort) }))
    .sort((left, right) => lexical(left.parentLabel, right.parentLabel));
}

export function hiddenComponentReferenceCount(records: readonly HiddenComponentRecord[]) {
  return records.reduce((sum, record) => sum + record.incomingReferenceCount, 0);
}

export function shortLocation(file: string | null, line: number | null) {
  if (!file) return "location unavailable";
  return `${file.split("/").at(-1) ?? file}${line ? `:${line}` : ""}`;
}

function inventorySort(left: HiddenComponentInventoryItem, right: HiddenComponentInventoryItem) {
  return (left.state === right.state ? 0 : left.state === "hidden" ? -1 : 1)
    || lexical(left.label, right.label)
    || lexical(left.file, right.file)
    || (left.line ?? 0) - (right.line ?? 0)
    || lexical(left.componentId, right.componentId);
}

function uniqueStrings(values: string[]) { return [...new Set(values)]; }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
