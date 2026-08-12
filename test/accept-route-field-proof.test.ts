import { describe, expect, it } from "vitest";
import type { RouteTotalityFieldAttachment } from "../src/analysis/route-totality-field-lineage";
import {
  actualRecord,
  evaluateFieldProof,
  type Actual,
  type Obligation,
  type ProofEvidence,
} from "../scripts/accept-route-field-proof";

const obligation: Obligation = {
  id: "G01",
  fieldPath: "games[*].status",
  label: "Status render",
  kind: "render",
  alias: null,
  targetKey: "target:status",
};

const actual: Actual = {
  fieldPath: obligation.fieldPath,
  label: obligation.label,
  kind: obligation.kind,
  alias: obligation.alias,
  targetKey: obligation.targetKey,
  occurrenceId: "occurrence:1",
  terminalId: "terminal:1",
  consumerTerminalRelationId: "relation:1",
};

function attachment(overrides: Partial<RouteTotalityFieldAttachment> = {}) {
  return {
    id: "attachment:1",
    origin: { elementId: "origin:1", role: "filesystem", selectedEvidenceId: "source:1" },
    field: { elementIds: ["field:1"], segments: [], label: obligation.fieldPath, location: { file: "fixture.tsx", line: 1, column: 1, span: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 2 } } },
    occurrenceId: "occurrence:1",
    terminalIds: ["terminal:1"],
    evidencePathElementIds: [],
    evidencePathRelationIds: [],
    proof: [],
    locations: [],
    consumer: {
      id: "consumer:1",
      elementId: "consumer-element:1",
      occurrenceElementId: "occurrence-element:1",
      kind: "render",
      label: obligation.label,
      occurrenceId: "occurrence:1",
      routeTerminalId: "terminal:1",
      fieldLineageTerminalElementId: "field-terminal-element:1",
      fieldLineageTerminalRelationId: "relation:1",
      target: { targetKey: obligation.targetKey },
      location: { file: "fixture.tsx", line: 2, column: 1, span: { startLine: 2, startColumn: 1, endLine: 2, endColumn: 2 } },
    },
    alias: null,
    transformationIds: [],
    transformationKinds: [],
    ...overrides,
  } as unknown as RouteTotalityFieldAttachment;
}

const evidence: ProofEvidence = {
  elements: [{ id: "field-terminal-element:1", kind: "render-terminal", status: "proven" }],
  relations: [{ id: "relation:1", from: "consumer-element:1", to: "field-terminal-element:1", kind: "render-terminal", status: "proven", proof: { kind: "field-consumer-terminal", status: "proven" } }],
};

describe("route field proof acceptance", () => {
  it("returns the compact positive result shape", () => {
    const result = evaluateFieldProof([actual], [obligation], []);

    expect(result).toMatchObject({ attachments: 1, fieldPaths: [obligation.fieldPath], consumerTerminalRelationCount: 1, missing: [], unexpected: [], failures: [] });
    expect(result.deterministicResultHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a vacuous positive result", () => {
    const result = evaluateFieldProof([], [obligation], []);

    expect(result.failures).toContain("No positive field attachments were proven.");
    expect(result.failures).toContain("No selected field paths were proven.");
  });

  it("changes the hash when proof identity changes", () => {
    const changed = { ...actual, occurrenceId: "occurrence:2" };

    expect(evaluateFieldProof([actual], [obligation], []).deterministicResultHash)
      .not.toBe(evaluateFieldProof([changed], [obligation], []).deterministicResultHash);
  });

  it("rejects a required field path that stops at a frontier", () => {
    const result = evaluateFieldProof([actual], [obligation], [{ id: "frontier:1", field: { label: obligation.fieldPath }, reason: "unsupported-syntax" }]);

    expect(result.requiredFrontiers).toEqual(["frontier:1"]);
    expect(result.failures).toContain("Required field paths stop at frontiers: frontier:1.");
  });

  it("rejects terminal ownership and terminal relation failures", () => {
    expect(() => actualRecord(attachment({ terminalIds: ["terminal:1", "terminal:2"] }), evidence, [{ id: "terminal:1", ownerOccurrenceId: "occurrence:1" }]))
      .toThrow("exactly one occurrence-owned terminal");
    expect(() => actualRecord(attachment(), { ...evidence, relations: [] }, [{ id: "terminal:1", ownerOccurrenceId: "occurrence:1" }]))
      .toThrow("exactly one proven consumer-terminal relation");
  });
});
