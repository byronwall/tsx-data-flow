import { describe, expect, it } from "vitest";
import type { RouteDataInventory } from "../../src/api/contracts";
import { parseTrajectoryUrlState, reconcileTrajectoryUrlState, serializeTrajectoryUrlState } from "../../src/frontend/src/overview/trajectory-url-state";

const inventory: RouteDataInventory = {
  routes: [{ key: "route:a", pathPattern: "/a", file: "src/routes/a.tsx", componentIdentityId: null, parameters: [], confidence: "high", componentNames: ["A"], routeKind: "page", sourceMethodKeys: ["source:a"], apiRouteKeys: [], trajectoryCount: 1, completeTrajectoryCount: 0, totalPathSteps: 2, uniqueStepCount: 2, substitutionStepCount: 0, unknownGapCount: 1, omissions: [] }],
  sources: [{ key: "source:a", label: "readA", kind: "file", file: "src/read.ts", line: 1, routeKeys: ["route:a"] }],
  trajectories: [{ key: "flow:a", routeKey: "route:a", label: "A flow", operationCount: 2, terminalCount: 1, sourceMethodKey: "source:a", substitutionStepCount: 0, routeReachableTerminalCount: 1, completeness: "partial", omissions: ["Cross-operation handoffs are not yet proven."] }],
  totals: { routes: 1, sources: 1, trajectories: 1, complete: 1 },
};

describe("trajectory URL state", () => {
  it("round trips every meaningful exploration field", () => {
    const state = {
      route: "route:a", flow: "flow:a", isolate: true, mode: "detail" as const, kind: "all" as const, sort: "substitutions" as const,
      source: "source:a", filter: "TimeBlockItem", genericUi: "hidden" as const,
      totalitySelection: { kind: "node" as const, graphId: "node:1" }, graphCamera: { x: 12.5, y: -4, scale: 1.25 },
      contextFocus: "context:1", fieldFocus: "field:title", consumerFocus: "consumer:1",
    };
    expect(parseTrajectoryUrlState(serializeTrajectoryUrlState(state))).toEqual(state);
  });
  it("retains a valid route while clearing invalid descendants", () => {
    const restored = reconcileTrajectoryUrlState(parseTrajectoryUrlState("?trajectoryMode=detail&route=route%3Aa&flow=missing&isolate=1&totalitySelection=node%3Aold&graphCamera=1,2,1&contextFocus=old&totalityField=old"), inventory);
    expect(restored.state.route).toBe("route:a");
    expect(restored.state.flow).toBe("flow:a");
    expect(restored.state.isolate).toBe(false);
    expect(restored.state.totalitySelection).toBeNull();
    expect(restored.state.graphCamera).toBeNull();
    expect(restored.state.contextFocus).toBeNull();
    expect(restored.state.fieldFocus).toBeNull();
    expect(restored.notice).toContain("invalid descendants");
  });
});
