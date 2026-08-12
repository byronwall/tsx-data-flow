import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAnalyzer } from "../src/core";
import { buildRouteDataDetail, buildRouteDataInventory } from "../src/api/projections/route-data";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";
import { parseArgs } from "../src/cli/args";

const fixtureRoot = path.resolve("examples/compact-field-proof");

describe("generic route field proof fixture", () => {
  it("proves the compact positive shapes and names unsupported code transforms", () => {
    const first = compactFieldLineage();
    const second = compactFieldLineage();

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.attachments.map((item) => item.field.label).sort()).toEqual([
      "projects[*].id",
      "projects[*].name",
      "projects[*].ownerName",
    ]);
    expect(first.attachments.map((item) => item.consumer?.label).sort()).toEqual([
      "A.href schedule",
      "PageHeader.title",
      "ProjectDetails owner",
    ]);
    expect(first.attachments.some((item) => item.field.label.includes("unrelated"))).toBe(false);
    expect(first.attachments.some((item) => item.field.label.endsWith(".code"))).toBe(false);
    expect(first.frontiers).toHaveLength(1);
    expect(first.frontiers[0]).toMatchObject({ field: { label: "projects[*].code" }, reason: "unsupported-transform" });
    expect(first.omissions.some((item) => item.includes("formatProjectCode"))).toBe(true);

    const report = reportForCompact();
    const inventory = buildRouteDataInventory(report);
    const route = inventory.routes.find((item) => item.pathPattern === "/projects");
    const source = inventory.sources.find((item) => item.routeKeys.includes(route?.key ?? ""));
    const flow = report.routeData.trajectories.find((item) => item.routeKey === route?.key);
    const detail = route && source && flow ? buildRouteDataDetail(report, route.key, flow.key, source.key) : null;
    expect(detail?.totality?.counts.origins).toEqual({ emitted: 5, total: 5, totalStatus: "exact" });
    expect(detail?.totality?.fieldLineage.counts.fields).toBe(4);
    expect(detail?.totality?.fieldLineage.frontiers[0]).toMatchObject({ field: { label: "projects[*].code" }, reason: "unsupported-transform" });
  });
});

function reportForCompact() {
  return createAnalyzer(parseArgs(["--root", fixtureRoot, "--format", "json", "--view", "work-packets"])).report();
}

function compactFieldLineage() {
  const args = parseArgs(["--root", fixtureRoot, "--format", "json", "--view", "work-packets"]);
  const report = createAnalyzer(args).report();
  const inventory = buildRouteDataInventory(report);
  const route = inventory.routes.find((item) => item.pathPattern === "/projects");
  const source = inventory.sources.find((item) => item.routeKeys.includes(route?.key ?? ""));
  if (!route || !source) throw new Error("The compact fixture route source is missing.");
  const evidence = report.routeData.evidence.find((item) => item.id === source.evidenceId);
  if (!evidence?.programElementId) throw new Error("The compact fixture source evidence is missing.");
  const record = routeTotalityForRoute(report.routeData, route.key, {
    key: source.key,
    evidence: {
      id: evidence.id,
      elementId: evidence.programElementId,
      file: evidence.file,
      line: evidence.line,
      column: evidence.column,
      span: evidence.span,
    },
  });
  if (!record) throw new Error("The compact fixture field proof record is missing.");
  return record.fieldLineage;
}
