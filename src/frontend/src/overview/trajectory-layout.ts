import type { RouteDataDetail } from "../../../api/contracts";

export const TRAJECTORY_STAGES = ["PERSISTED SOURCE", "LOAD / BOUNDARY", "SHAPE / DERIVE", "ROUTE / COMPONENT", "RENDER"] as const;
export const TRAJECTORY_NODE_WIDTH = 216;
export const TRAJECTORY_NODE_GAP = 18;
export type TrajectoryLayoutItem = RouteDataDetail["operations"][number] & { x: number; stage: number; children: RouteDataDetail["evidence"] };
export function layoutTrajectory(detail: RouteDataDetail, expanded: ReadonlySet<string>) {
  const evidence = new Map(detail.evidence.map((item) => [item.id, item]));
  const items: TrajectoryLayoutItem[] = [];
  let x = 20;
  for (const operation of detail.operations) {
    const children = operation.sourceExpressionIds.map((id) => evidence.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    items.push({ ...operation, x, stage: stageFor(operation.semanticKind, operation.boundary), children: expanded.has(operation.key) ? children : [] });
    x += TRAJECTORY_NODE_WIDTH + TRAJECTORY_NODE_GAP;
  }
  return { items, width: Math.max(720, x + 20), height: 390 };
}
export function stageFor(kind: RouteDataDetail["operations"][number]["semanticKind"], boundary?: RouteDataDetail["operations"][number]["boundary"]) { if (kind === "read") return 0; if (kind === "boundary" && boundary?.kind === "component") return 3; if (["parse", "validate", "boundary"].includes(kind)) return 1; if (["map", "project", "augment", "derive", "select", "group", "normalize", "opaque"].includes(kind)) return 2; if (kind === "render") return 4; return 3; }
