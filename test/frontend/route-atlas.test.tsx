// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteDataInventory } from "../../src/api/contracts";
import { RouteAtlas } from "../../src/frontend/src/overview/RouteAtlas";

const base = { componentIdentityId: null, parameters: [], confidence: "high" as const, componentNames: [], apiRouteKeys: [], completeTrajectoryCount: 0, omissions: [] };
const inventory: RouteDataInventory = {
  routes: [
    { ...base, key: "route:busy", pathPattern: "/busy", file: "src/routes/busy.tsx", routeKind: "page", sourceMethodKeys: ["source:shared"], trajectoryCount: 4, totalPathSteps: 24, uniqueStepCount: 10, substitutionStepCount: 3, unknownGapCount: 1 },
    { ...base, key: "route:plain", pathPattern: "/plain", file: "src/routes/plain.tsx", routeKind: "page", sourceMethodKeys: ["source:plain"], trajectoryCount: 1, totalPathSteps: 6, uniqueStepCount: 6, substitutionStepCount: 0, unknownGapCount: 0 },
    { ...base, key: "route:api", pathPattern: "/api/busy", file: "src/routes/api/busy.ts", routeKind: "api", sourceMethodKeys: ["source:shared"], trajectoryCount: 2, totalPathSteps: 9, uniqueStepCount: 7, substitutionStepCount: 1, unknownGapCount: 1 },
  ],
  sources: [
    { key: "source:shared", label: "readBusy", kind: "file", file: "src/store.ts", line: 4, routeKeys: ["route:busy", "route:api"] },
    { key: "source:plain", label: "readPlain", kind: "prisma", file: "src/db.ts", line: 8, routeKeys: ["route:plain"] },
  ],
  trajectories: [], totals: { routes: 3, sources: 2, trajectories: 7, complete: 0 },
};

describe("route complexity atlas", () => {
  afterEach(cleanup);
  it("defaults to page complexity, switches route kind, and exposes source sharing", async () => {
    const [kind, setKind] = createSignal<"pages" | "api" | "all">("pages");
    const [source, setSource] = createSignal<string | null>(null);
    const selectRoute = vi.fn();
    const { container } = render(() => <RouteAtlas inventory={inventory} kind={kind()} sort="steps" filter={null} source={source()} onKind={setKind} onSort={() => undefined} onFilter={() => undefined} onSource={setSource} onRoute={selectRoute} />);
    const routeLabels = () => [...container.querySelectorAll(".route-atlas-route code")].map((node) => node.textContent);
    expect(routeLabels()).toEqual(["/busy", "/plain"]);
    expect(screen.getByRole("button", { name: "readBusy" }).title).toContain("2 routes");
    await fireEvent.click(screen.getByRole("button", { name: "API" }));
    expect(routeLabels()).toEqual(["/api/busy"]);
    await fireEvent.click(screen.getByRole("button", { name: "All" }));
    await fireEvent.click(screen.getAllByRole("button", { name: "readBusy" })[0]);
    expect(routeLabels()).toEqual(["/busy", "/api/busy"]);
    await fireEvent.click(screen.getByRole("button", { name: /^\/busypage/ }));
    expect(selectRoute).toHaveBeenCalledWith("route:busy");
  });
});
