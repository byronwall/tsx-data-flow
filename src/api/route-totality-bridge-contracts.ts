import { z } from "zod";
import {
  evidenceProofSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  originRoleSchema,
  sourceLocationSchema,
} from "./route-totality-contract-primitives";

const routeTotalityBridgeOriginEndpointSchema = z.strictObject({
  layer: z.literal("evidence-slice"),
  kind: z.literal("origin"),
  elementId: nonEmptyStringSchema,
  role: originRoleSchema,
});

const routeTotalityBridgeOccurrenceEndpointSchema = z.strictObject({
  layer: z.literal("occurrence-surface"),
  kind: z.literal("occurrence"),
  occurrenceId: nonEmptyStringSchema,
});

const routeTotalityBridgeTerminalEndpointSchema = z.strictObject({
  layer: z.literal("occurrence-surface"),
  kind: z.literal("terminal"),
  terminalId: nonEmptyStringSchema,
});

const routeTotalityBridgeCommonSchema = {
  id: nonEmptyStringSchema,
  status: z.enum(["proven", "partial"]),
  proof: evidenceProofSchema,
  locations: z.array(sourceLocationSchema).min(1),
  evidencePathElementIds: z.array(nonEmptyStringSchema).min(1),
  evidencePathRelationIds: z.array(nonEmptyStringSchema),
};

export const routeTotalityBridgeSchema = z.discriminatedUnion("direction", [
  z.strictObject({
    ...routeTotalityBridgeCommonSchema,
    direction: z.literal("origin-to-render"),
    from: routeTotalityBridgeOriginEndpointSchema,
    to: routeTotalityBridgeOccurrenceEndpointSchema,
  }),
  z.strictObject({
    ...routeTotalityBridgeCommonSchema,
    direction: z.literal("render-terminal-to-origin"),
    from: routeTotalityBridgeTerminalEndpointSchema,
    to: routeTotalityBridgeOriginEndpointSchema,
  }),
]);

export const routeTotalityBridgeCountsSchema = z.strictObject({
  total: nonNegativeIntegerSchema,
  originToRender: nonNegativeIntegerSchema,
  renderTerminalToOrigin: nonNegativeIntegerSchema,
  proven: nonNegativeIntegerSchema,
  partial: nonNegativeIntegerSchema,
});
