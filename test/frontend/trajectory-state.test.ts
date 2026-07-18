import { describe, expect, it } from "vitest";
import type { RouteDataInventory } from "../../src/api/contracts";
import { parseTrajectoryUrlState, reconcileTrajectoryUrlState, serializeTrajectoryUrlState } from "../../src/frontend/src/overview/trajectory-url-state";

const inventory: RouteDataInventory = {
  routes: [{ key: "route:a", pathPattern: "/a", file: "src/routes/a.tsx", componentIdentityId: null, parameters: [], confidence: "high", componentNames: ["A"], routeKind: "page", sourceMethodKeys: ["source:a"], apiRouteKeys: [], trajectoryCount: 1, completeTrajectoryCount: 0, totalPathSteps: 2, uniqueStepCount: 2, substitutionStepCount: 0, unknownGapCount: 1, omissions: [] }],
  sources: [{ key: "source:a", label: "readA", kind: "file", file: "src/read.ts", line: 1, routeKeys: ["route:a"] }],
  trajectories: [{ key: "flow:a", routeKey: "route:a", label: "A flow", operationCount: 2, terminalCount: 1, sourceMethodKey: "source:a", substitutionStepCount: 0, routeReachableTerminalCount: 1, terminalSelectionLimit: 4, ordering: "semantic-stage", handoffsProven: false, completeness: "partial", omissions: ["Cross-operation handoffs are not yet proven."] }],
  totals: { routes: 1, sources: 1, trajectories: 1, complete: 1 },
};

describe("trajectory URL state", () => {
  it("round trips every meaningful exploration field", () => {
    const state = { open: true, route: "route:a", flow: "flow:a", item: "operation:1", expand: ["operation:1", "operation:2"], isolate: true, mode: "detail" as const, kind: "all" as const, sort: "substitutions" as const, source: "source:a", filter: "TimeBlockItem", view: "trajectory" as const, pan: { x: 12.5, y: -4 }, zoom: 1.25, packet: "packet:1" };
    expect(parseTrajectoryUrlState(serializeTrajectoryUrlState(state))).toEqual(state);
  });
  it("retains a valid route while clearing invalid descendants", () => {
    const restored = reconcileTrajectoryUrlState(parseTrajectoryUrlState("?viz=trajectory&trajectoryMode=detail&route=route%3Aa&flow=missing&item=old&expand=old&isolate=1"), inventory);
    expect(restored.state.route).toBe("route:a");
    expect(restored.state.flow).toBe("flow:a");
    expect(restored.state.item).toBeNull();
    expect(restored.state.expand).toEqual([]);
    expect(restored.notice).toContain("invalid descendants");
  });
});
