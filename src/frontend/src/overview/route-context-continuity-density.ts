export type ContextDensity = "sparse" | "dense";

export type ContextDisplayMode = "automatic" | "overlay" | "marks";

export type ContextResolvedDisplayMode = Exclude<ContextDisplayMode, "automatic">;

export type ContextDisplayModeReason = "sparse" | "dense" | "focused" | "override";

export type ContextDensityCounts = {
  consumers: number;
  providers: number;
};

export const CONTEXT_DENSITY_LIMITS = Object.freeze({
  maxSparseConsumers: 3,
  maxSparseProviders: 2,
});

export function classifyContextDensity(counts: ContextDensityCounts): ContextDensity {
  return counts.consumers <= CONTEXT_DENSITY_LIMITS.maxSparseConsumers
    && counts.providers <= CONTEXT_DENSITY_LIMITS.maxSparseProviders
    ? "sparse"
    : "dense";
}

export function automaticContextDisplayMode(
  density: ContextDensity,
  focused = false,
): ContextResolvedDisplayMode {
  return focused || density === "sparse" ? "overlay" : "marks";
}

export function resolveContextDisplayMode(options: {
  density: ContextDensity;
  focused?: boolean;
  override?: ContextDisplayMode;
}): {
  requestedMode: ContextDisplayMode;
  mode: ContextResolvedDisplayMode;
  reason: ContextDisplayModeReason;
} {
  const focused = options.focused ?? false;
  const requestedMode = options.override ?? "automatic";
  if (focused) {
    return { requestedMode, mode: "overlay", reason: "focused" };
  }
  if (requestedMode !== "automatic") {
    return { requestedMode, mode: requestedMode, reason: "override" };
  }
  return {
    requestedMode,
    mode: automaticContextDisplayMode(options.density),
    reason: options.density,
  };
}

export function contextDensityLabel(density: ContextDensity): string {
  return density === "sparse" ? "Sparse · ≤3 consumers" : "Dense · consumer-heavy";
}

export function contextDensityDescription(density: ContextDensity): string {
  return density === "sparse"
    ? "At most 3 consumer occurrences and 2 Provider occurrences. Automatic mode shows explicit links."
    : "More than 3 consumer occurrences or more than 2 Provider occurrences. Automatic mode uses node marks until focused.";
}

export function contextDisplayModeLabel(mode: ContextDisplayMode | ContextResolvedDisplayMode): string {
  if (mode === "automatic") return "Automatic context display";
  return mode === "overlay" ? "Explicit context links" : "Context node marks";
}

export function contextDisplayModeDescription(mode: ContextResolvedDisplayMode): string {
  return mode === "overlay"
    ? "Show each retained context continuity link as an explicit overlay record."
    : "Show context participation as marks on route display nodes."
}
