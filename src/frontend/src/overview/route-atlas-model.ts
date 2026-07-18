import type { RouteDataInventory } from "../../../api/contracts";

export type RouteAtlasKind = "pages" | "api" | "all";
export type RouteAtlasSort = "steps" | "paths" | "unique" | "substitutions" | "gaps";
type Route = RouteDataInventory["routes"][number];

export function atlasRoutes(inventory: RouteDataInventory, options: { kind: RouteAtlasKind; sort: RouteAtlasSort; filter: string | null; source: string | null }) {
  const query = options.filter?.trim().toLowerCase() ?? "";
  const source = inventory.sources.find((item) => item.key === options.source);
  return inventory.routes.filter((route) => {
    if (options.kind !== "all" && route.routeKind !== (options.kind === "pages" ? "page" : "api")) return false;
    if (query && !`${route.pathPattern} ${route.file} ${route.sourceMethodKeys.map((key) => inventory.sources.find((item) => item.key === key)?.label ?? "").join(" ")}`.toLowerCase().includes(query)) return false;
    return !source || route.sourceMethodKeys.includes(source.key);
  }).sort((left, right) => metric(right, options.sort) - metric(left, options.sort) || lexical(left.pathPattern, right.pathPattern));
}

export function atlasMaximum(routes: Route[]) { return Math.max(1, ...routes.map((route) => route.totalPathSteps)); }

function metric(route: Route, sort: RouteAtlasSort) {
  if (sort === "paths") return route.trajectoryCount;
  if (sort === "unique") return route.uniqueStepCount;
  if (sort === "substitutions") return route.substitutionStepCount;
  if (sort === "gaps") return route.unknownGapCount;
  return route.totalPathSteps;
}
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
