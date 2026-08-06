import type {
  ComponentOccurrence,
  CompilerLocation,
} from "./component-occurrence-identity";

export type TransparentWrapperProjectionEdge = {
  fromOccurrenceId: string;
  toOccurrenceId: string;
  kind: "render" | "transparent-splice";
  hiddenWrapperOccurrenceId: string | null;
  evidence: {
    kind: "parent-occurrence" | "transparent-wrapper-splice";
    detail: string;
    locations: CompilerLocation[];
  };
};

export type HiddenWrapperPathEvidence = {
  wrapperOccurrenceId: string;
  definitionId: string;
  parentOccurrenceId: string | null;
  callerOwnedChildOccurrenceIds: string[];
  sourcePathParticipates: boolean;
  callSite: CompilerLocation;
  hiddenEdges: Array<{
    fromOccurrenceId: string;
    toOccurrenceId: string;
    locations: CompilerLocation[];
  }>;
};

export type TransparentWrapperProjection = {
  hiddenOccurrenceId: string;
  visibleEdges: TransparentWrapperProjectionEdge[];
  hiddenPaths: HiddenWrapperPathEvidence[];
  reattachedChildOccurrenceIds: string[];
};

export function projectTransparentWrapper(
  occurrences: readonly ComponentOccurrence[],
  wrapperOccurrenceId: string,
  sourcePathOccurrenceIds: readonly string[] = [],
): TransparentWrapperProjection | null {
  const wrapper = occurrences.find((occurrence) => occurrence.id === wrapperOccurrenceId);
  if (!wrapper) return null;

  const children = occurrences.filter(
    (occurrence) => occurrence.parentOccurrenceId === wrapper.id,
  );
  const sourcePath = new Set(sourcePathOccurrenceIds);
  const visibleEdges = occurrences
    .filter((occurrence) => occurrence.parentOccurrenceId)
    .flatMap((occurrence) => {
      if (occurrence.parentOccurrenceId === wrapper.id) {
        return [spliceEdge(wrapper, occurrence)];
      }
      if (occurrence.id === wrapper.id) return [];
      return [parentEdge(occurrence)];
    });
  const hiddenPath: HiddenWrapperPathEvidence = {
    wrapperOccurrenceId: wrapper.id,
    definitionId: wrapper.definitionId,
    parentOccurrenceId: wrapper.parentOccurrenceId,
    callerOwnedChildOccurrenceIds: children
      .filter((child) => child.ownership === "caller-owned")
      .map((child) => child.id),
    sourcePathParticipates: sourcePath.has(wrapper.id),
    callSite: wrapper.callSite,
    hiddenEdges: children.map((child) => ({
      fromOccurrenceId: wrapper.id,
      toOccurrenceId: child.id,
      locations: [wrapper.callSite, child.callSite],
    })),
  };

  return {
    hiddenOccurrenceId: wrapper.id,
    visibleEdges,
    hiddenPaths: [hiddenPath],
    reattachedChildOccurrenceIds: children
      .filter((child) => child.ownership === "caller-owned")
      .map((child) => child.id),
  };
}

function parentEdge(occurrence: ComponentOccurrence): TransparentWrapperProjectionEdge {
  return {
    fromOccurrenceId: occurrence.parentOccurrenceId!,
    toOccurrenceId: occurrence.id,
    kind: "render",
    hiddenWrapperOccurrenceId: null,
    evidence: {
      kind: "parent-occurrence",
      detail: "The child JSX occurrence has this compiler-resolved parent occurrence.",
      locations: [occurrence.callSite],
    },
  };
}

function spliceEdge(
  wrapper: ComponentOccurrence,
  child: ComponentOccurrence,
): TransparentWrapperProjectionEdge {
  return {
    fromOccurrenceId: wrapper.parentOccurrenceId ?? "scope-root",
    toOccurrenceId: child.id,
    kind: "transparent-splice",
    hiddenWrapperOccurrenceId: wrapper.id,
    evidence: {
      kind: "transparent-wrapper-splice",
      detail: "Only this wrapper occurrence's caller-owned JSX children are reattached.",
      locations: [wrapper.callSite, child.callSite],
    },
  };
}
