import { describe, expect, it } from "vitest";
import type { RouteDataDetail } from "../../src/api/contracts";
import { cleanCompilerType, trajectoryShapeLabel, trajectoryShapeMeta, trajectoryShapeSummary } from "../../src/frontend/src/overview/trajectory-shape-label";

const shape = (overrides: Partial<RouteDataDetail["shapes"][number]> = {}): RouteDataDetail["shapes"][number] => ({
  id: "shape:1",
  typeName: null,
  typeText: 'import("/Users/example/app/src/store/capture-detail").CaptureDetail | null | undefined',
  kind: "union",
  fields: [],
  totalFields: 12,
  opacityReason: null,
  ...overrides,
});

describe("trajectory shape labels", () => {
  it("turns compiler-qualified types into product-facing output summaries", () => {
    expect(trajectoryShapeLabel(shape())).toBe("CaptureDetail");
    expect(trajectoryShapeMeta(shape())).toBe("12 fields · may be empty");
    expect(cleanCompilerType(shape().typeText)).toBe("CaptureDetail | null | undefined");
  });

  it("prefers a useful declared type name while retaining nullability metadata", () => {
    expect(trajectoryShapeLabel(shape({ typeName: "CaptureDetail" }))).toBe("CaptureDetail");
    expect(trajectoryShapeMeta(shape({ typeName: "CaptureDetail" }))).toContain("may be empty");
    expect(trajectoryShapeSummary(shape({ typeName: "CaptureDetail", totalFields: 0 }))).toBe("CaptureDetail · may be empty");
  });
});
