import { beforeAll, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args";
import { buildRouteDataDetail, buildRouteDataInventory } from "../src/api/projections/route-data";
import { analyzeProject } from "../src/core";
import type { RouteTotality } from "../src/api/route-totality-contracts";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";

const soccerAppRoot = "/Users/byronwall/Projects/soccer-schedule/app";
const noSelectedSourceReason = "No source is selected; exact field lineage is inactive.";

type TargetKey = {
  collectionFieldName: string;
  predicateFieldName: string;
  consumerFieldName: string;
  chain: "direct" | "whole-object" | "scalar-alias";
  componentName: string | null;
  componentPropName: string | null;
  consumer: {
    kind: "render" | "condition" | "handler";
    directConsumer: boolean;
    componentName: string | null;
    propName: string | null;
    tagName: string | null;
    tagModule: string | null;
    actionName: string | null;
    argumentName: string | null;
    handlerReceiverName: string | null;
    conditionOperator: string | null;
    conditionLiteral: string | null;
    nestedShow: boolean | null;
    collectionName: string | null;
  };
};

type ExpectedConsumer = {
  name: string;
  field: string;
  kind: TargetKey["consumer"]["kind"];
  alias: string | null;
  file: string;
  line: number;
  column: number;
  target: TargetKey;
};

function targetKey(
  consumerFieldName: string,
  chain: TargetKey["chain"],
  componentName: string | null,
  componentPropName: string | null,
  consumer: TargetKey["consumer"],
): TargetKey {
  return { collectionFieldName: "games", predicateFieldName: "id", consumerFieldName, chain, componentName, componentPropName, consumer };
}

const expectedConsumers: ExpectedConsumer[] = [
  {
    name: "PageHeader.eyebrow condition", field: "games[*].status", kind: "condition", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 44, column: 22,
    target: targetKey("status", "direct", null, null, { kind: "condition", directConsumer: true, componentName: "PageHeader", propName: "eyebrow", tagName: null, tagModule: "./PageHeader", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: "===", conditionLiteral: "completed", nestedShow: null, collectionName: null }),
  },
  {
    name: "PageHeader.title", field: "games[*].opponentName", kind: "render", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 45, column: 20,
    target: targetKey("opponentName", "direct", null, null, { kind: "render", directConsumer: false, componentName: "PageHeader", propName: "title", tagName: null, tagModule: "./PageHeader", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "PageHeader.description date", field: "games[*].startsAt", kind: "render", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 46, column: 38,
    target: targetKey("startsAt", "direct", null, null, { kind: "render", directConsumer: true, componentName: "PageHeader", propName: "description", tagName: null, tagModule: "./PageHeader", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "PageHeader.description venue", field: "games[*].venueName", kind: "render", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 52, column: 21,
    target: targetKey("venueName", "direct", null, null, { kind: "render", directConsumer: true, componentName: "PageHeader", propName: "description", tagName: null, tagModule: "./PageHeader", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "Show.when build actions", field: "games[*].status", kind: "condition", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 55, column: 29,
    target: targetKey("status", "direct", null, null, { kind: "condition", directConsumer: true, componentName: null, propName: "when", tagName: "Show", tagModule: "solid-js", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: "!==", conditionLiteral: "completed", nestedShow: true, collectionName: null }),
  },
  {
    name: "A.href schedule", field: "games[*].id", kind: "render", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 64, column: 40,
    target: targetKey("id", "direct", null, null, { kind: "render", directConsumer: true, componentName: null, propName: "href", tagName: "A", tagModule: "@solidjs/router", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "Show.when edit action", field: "games[*].status", kind: "condition", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 71, column: 29,
    target: targetKey("status", "direct", null, null, { kind: "condition", directConsumer: true, componentName: null, propName: "when", tagName: "Show", tagModule: "solid-js", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: "!==", conditionLiteral: "completed", nestedShow: false, collectionName: null }),
  },
  {
    name: "deleteGame.id", field: "games[*].id", kind: "handler", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 80, column: 55,
    target: targetKey("id", "direct", null, null, { kind: "handler", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: "deleteGame", argumentName: "id", handlerReceiverName: "data", conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "Show.when completed branch", field: "games[*].status", kind: "condition", alias: null,
    file: "src/components/soccer/GamePages.tsx", line: 90, column: 19,
    target: targetKey("status", "direct", null, null, { kind: "condition", directConsumer: true, componentName: null, propName: "when", tagName: "Show", tagModule: "solid-js", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: "===", conditionLiteral: "completed", nestedShow: false, collectionName: null }),
  },
  {
    name: "ScheduledGamePlanningDetails venue", field: "games[*].venueName", kind: "render", alias: null,
    file: "src/components/soccer/ScheduledGamePlanningDetails.tsx", line: 181, column: 44,
    target: targetKey("venueName", "whole-object", "ScheduledGamePlanningDetails", "game", { kind: "render", directConsumer: true, componentName: null, propName: null, tagName: "Text", tagModule: "~/components/ui/text", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "ScheduledGamePlanningDetails address", field: "games[*].venueAddress", kind: "render", alias: null,
    file: "src/components/soccer/ScheduledGamePlanningDetails.tsx", line: 183, column: 20,
    target: targetKey("venueAddress", "whole-object", "ScheduledGamePlanningDetails", "game", { kind: "render", directConsumer: true, componentName: null, propName: null, tagName: "Text", tagModule: "~/components/ui/text", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "Scheduled availability gameId condition", field: "games[*].id", kind: "condition", alias: null,
    file: "src/components/soccer/ScheduledGamePlanningDetails.tsx", line: 23, column: 25,
    target: targetKey("id", "whole-object", "ScheduledGamePlanningDetails", "game", { kind: "condition", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: "availability" }),
  },
  {
    name: "markAllAvailable.gameId", field: "games[*].id", kind: "handler", alias: null,
    file: "src/components/soccer/ScheduledGamePlanningDetails.tsx", line: 41, column: 52,
    target: targetKey("id", "whole-object", "ScheduledGamePlanningDetails", "game", { kind: "handler", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: "markAllAvailable", argumentName: "gameId", handlerReceiverName: "data", conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "setAvailability.gameId", field: "games[*].id", kind: "handler", alias: null,
    file: "src/components/soccer/ScheduledGamePlanningDetails.tsx", line: 100, column: 39,
    target: targetKey("id", "whole-object", "ScheduledGamePlanningDetails", "game", { kind: "handler", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: "setAvailability", argumentName: "gameId", handlerReceiverName: "data", conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
  {
    name: "Completed schedule gameId condition", field: "games[*].id", kind: "condition", alias: "id -> gameId",
    file: "src/components/soccer/CompletedGameSummary.tsx", line: 23, column: 28,
    target: targetKey("gameId", "scalar-alias", "CompletedGameSummary", "gameId", { kind: "condition", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: "schedules" }),
  },
  {
    name: "Completed availability gameId condition", field: "games[*].id", kind: "condition", alias: "id -> gameId",
    file: "src/components/soccer/CompletedGameSummary.tsx", line: 28, column: 25,
    target: targetKey("gameId", "scalar-alias", "CompletedGameSummary", "gameId", { kind: "condition", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: "availability" }),
  },
  {
    name: "Completed live gameId condition", field: "games[*].id", kind: "condition", alias: "id -> gameId",
    file: "src/components/soccer/CompletedGameSummary.tsx", line: 34, column: 45,
    target: targetKey("gameId", "scalar-alias", "CompletedGameSummary", "gameId", { kind: "condition", directConsumer: true, componentName: null, propName: null, tagName: null, tagModule: null, actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: "liveGames" }),
  },
  {
    name: "Completed A.href live", field: "games[*].id", kind: "render", alias: "id -> gameId",
    file: "src/components/soccer/CompletedGameSummary.tsx", line: 139, column: 34,
    target: targetKey("gameId", "scalar-alias", "CompletedGameSummary", "gameId", { kind: "render", directConsumer: true, componentName: null, propName: "href", tagName: "A", tagModule: "@solidjs/router", actionName: null, argumentName: null, handlerReceiverName: null, conditionOperator: null, conditionLiteral: null, nestedShow: null, collectionName: null }),
  },
];

let report: Awaited<ReturnType<typeof analyzeProject>>;
let inventory: ReturnType<typeof buildRouteDataInventory>;

beforeAll(async () => {
  report = await analyzeProject(parseArgs([
    "--root", soccerAppRoot,
    "--source", "src",
    "--tsconfig", "tsconfig.json",
    "--typescript-from", process.cwd(),
    "--format", "json",
    "--view", "work-packets",
  ]));
  inventory = buildRouteDataInventory(report);
});

function routeDetail(pathPattern: string, selectedSource = true) {
  const route = inventory.routes.find((item) => item.pathPattern === pathPattern);
  if (!route) throw new Error(`Route ${pathPattern} was not found`);
  const sourceKey = route.sourceMethodKeys[0] ?? null;
  const trajectory = inventory.trajectories.find((item) => item.routeKey === route.key && item.sourceMethodKeys.includes(sourceKey ?? ""));
  if (!trajectory) throw new Error(`Route ${pathPattern} has no source trajectory`);
  const detail = buildRouteDataDetail(report, route.key, trajectory.key, selectedSource ? sourceKey : null);
  if (!detail?.totality) throw new Error(`Route ${pathPattern} has no totality detail`);
  return { detail, route, sourceKey, trajectory };
}

function availableEvidence(totality: RouteTotality) {
  if (!("elements" in totality.evidenceSlice)) throw new Error("Expected an available evidence slice");
  return totality.evidenceSlice;
}

function parseTarget(attachment: RouteTotality["fieldLineage"]["attachments"][number]): TargetKey {
  if (!attachment.consumer) throw new Error(`Attachment ${attachment.field.label} has no consumer`);
  return JSON.parse(attachment.consumer.target.targetKey) as TargetKey;
}

describe("soccer schedule route totality field proof", () => {
  it("proves G01 through G18 as semantic records", () => {
    const { detail, route, sourceKey } = routeDetail("/games/[gameId]");
    const totality = detail.totality!;
    const lineage = totality.fieldLineage;
    expect(route.file).toBe("src/routes/games/[gameId]/index.tsx");
    expect(sourceKey).toBeTruthy();
    expect(lineage.status).toBe("partial");
    expect(lineage.frontiers).toEqual([]);
    expect(lineage.counts).toMatchObject({ origins: 1, fields: 15, occurrences: 4, terminals: 4, frontiers: 0 });
    expect(lineage.attachments).toHaveLength(expectedConsumers.length);

    for (const expected of expectedConsumers) {
      const matches = lineage.attachments.filter((attachment) => attachment.consumer?.label === expected.name);
      expect(matches, expected.name).toHaveLength(1);
      const [attachment] = matches;
      expect(attachment.field.label, expected.name).toBe(expected.field);
      expect(attachment.alias, expected.name).toBe(expected.alias);
      expect(attachment.consumer?.kind, expected.name).toBe(expected.kind);
      expect(attachment.consumer?.location, expected.name).toMatchObject({ file: expected.file, line: expected.line, column: expected.column });
      expect(parseTarget(attachment), expected.name).toEqual(expected.target);
      expect(attachment.proof.every((proof) => proof.status === "proven"), expected.name).toBe(true);
      expect(attachment.consumer?.target.directConsumer, expected.name).toBe(expected.target.consumer.directConsumer);

      const target = attachment.consumer!.target;
      if (expected.target.consumer.tagName) {
        expect(target.jsx, expected.name).toMatchObject({ tagName: expected.target.consumer.tagName, propName: expected.target.consumer.propName, identity: "component" });
      }
      if (expected.kind === "handler") {
        expect(target.handler, expected.name).toMatchObject({ receiverName: "data", actionName: expected.target.consumer.actionName, argumentField: expected.target.consumer.argumentName });
        expect(target.handler?.methodSymbol, expected.name).toBeTruthy();
        expect(target.handler?.payloadObject, expected.name).toBeTruthy();
      }
    }

    expect(new Set(lineage.attachments.map((attachment) => attachment.field.label))).toEqual(new Set([
      "games[*].id", "games[*].status", "games[*].opponentName", "games[*].startsAt", "games[*].venueName", "games[*].venueAddress",
    ]));
  });

  it("retains whole-object bindings and the scalar id-to-gameId alias", () => {
    const { detail } = routeDetail("/games/[gameId]");
    const attachments = detail.totality!.fieldLineage.attachments;
    const wholeObject = attachments.filter((attachment) => parseTarget(attachment).chain === "whole-object");
    expect(wholeObject).toHaveLength(5);
    expect(wholeObject.every((attachment) => parseTarget(attachment).componentName === "ScheduledGamePlanningDetails" && parseTarget(attachment).componentPropName === "game")).toBe(true);

    const aliases = attachments.filter((attachment) => attachment.alias === "id -> gameId");
    expect(aliases).toHaveLength(4);
    expect(aliases.every((attachment) => {
      const target = parseTarget(attachment);
      return target.componentName === "CompletedGameSummary" && target.componentPropName === "gameId" && target.consumerFieldName === "gameId";
    })).toBe(true);
  });

  it("binds every field consumer to its occurrence-owned terminal and exact terminal relation", () => {
    const { detail } = routeDetail("/games/[gameId]");
    const totality = detail.totality!;
    if (!("terminals" in totality.occurrenceSurface)) throw new Error("Expected an available occurrence surface");
    const evidence = availableEvidence(totality);

    for (const attachment of totality.fieldLineage.attachments) {
      const occurrenceTerminals = totality.occurrenceSurface.terminals.filter((terminal) => attachment.terminalIds.includes(terminal.id));
      expect(occurrenceTerminals).toHaveLength(1);
      expect(occurrenceTerminals[0].ownerOccurrenceId).toBe(attachment.occurrenceId);
      expect(occurrenceTerminals[0].id).toBe(attachment.terminalIds[0]);

      const consumer = attachment.consumer;
      if (!consumer) throw new Error(`Attachment ${attachment.field.label} has no consumer`);
      const consumerElement = evidence.elements.find((element) => element.id === consumer.elementId);
      const terminalElement = evidence.elements.find((element) => element.id === consumer.fieldLineageTerminalElementId);
      const relation = evidence.relations.find((candidate) => candidate.id === consumer.fieldLineageTerminalRelationId);
      expect(consumerElement).toMatchObject({ status: "proven", location: consumer.location });
      if (consumer.target.directConsumer) expect(consumerElement).toMatchObject({ kind: "field-consumer", consumerKind: consumer.kind });
      expect(terminalElement).toMatchObject({ kind: "render-terminal", status: "proven" });
      expect(terminalElement?.ownerId).toBeTruthy();
      expect(relation).toMatchObject({ from: consumer.elementId, to: consumer.fieldLineageTerminalElementId, kind: "render-terminal", status: "proven", proof: { kind: "field-consumer-terminal", status: "proven" } });
    }
  });

  it("keeps selected-source activation fail-closed and DTO IDs deterministic", () => {
    const selected = routeDetail("/games/[gameId]");
    const unselected = routeDetail("/games/[gameId]", false).detail.totality!.fieldLineage;
    expect(unselected).toMatchObject({ status: "unavailable", unavailableReason: noSelectedSourceReason, attachments: [], frontiers: [] });
    expect(buildRouteDataDetail(report, selected.route.key, selected.trajectory.key, "source-method:missing")).toBeNull();

    const repeated = buildRouteDataDetail(report, selected.route.key, selected.trajectory.key, selected.sourceKey);
    expect(repeated).toEqual(selected.detail);
    const lineage = selected.detail.totality!.fieldLineage;
    const selectedSource = selected.detail.sources.find((source) => source.key === selected.sourceKey);
    expect(selectedSource).toBeDefined();
    expect(lineage.attachments.every((attachment) => attachment.origin.selectedEvidenceId === selectedSource!.evidenceId)).toBe(true);
    expect(lineage.attachments.map((attachment) => attachment.id)).toEqual([...lineage.attachments].sort((left, right) => left.id.localeCompare(right.id)).map((attachment) => attachment.id));
    expect(lineage.transformations.map((transformation) => transformation.id)).toEqual([...lineage.transformations].sort((left, right) => left.id.localeCompare(right.id)).map((transformation) => transformation.id));
  });

  it("does not attach unrelated equal-name consumers", () => {
    const { detail } = routeDetail("/games/[gameId]");
    const expectedNames = new Set(expectedConsumers.map((expected) => expected.name));
    const attachments = detail.totality!.fieldLineage.attachments;
    expect(attachments.filter((attachment) => attachment.consumer && !expectedNames.has(attachment.consumer.label))).toEqual([]);
    expect(attachments.every((attachment) => attachment.field.segments[0]?.value === "games")).toBe(true);
    expect(attachments.every((attachment) => parseTarget(attachment).collectionFieldName === "games" && parseTarget(attachment).predicateFieldName === "id")).toBe(true);
  });

  it("stops the login route at its unresolved frontier", () => {
    const route = inventory.routes.find((item) => item.pathPattern === "/login");
    if (!route) throw new Error("Route /login was not found");
    const totality = routeTotalityForRoute(report.routeData, route.key);
    if (!totality) throw new Error("Route /login has no totality record");
    expect(route.sourceMethodKeys).toEqual([]);
    expect(totality.route.pathPattern).toBe("/login");
    expect(totality.occurrenceSurface.status).toBe("partial");
    const stopped = totality.occurrenceSurface.omissions.find((item) => item.reason === "unresolved-symbol" || item.reason === "unsupported-ownership" || item.reason === "external-code");
    expect(stopped).toBeDefined();
    expect(stopped).toMatchObject({ reason: "external-code", label: "The Box definition is outside the route source scope." });
    expect(stopped!.locations.every((location) => location.file === "src/components/soccer/LoginPage.tsx")).toBe(true);
  });
});
