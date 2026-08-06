import type {
  RouteShadowOccurrenceContract,
  RouteShadowOccurrenceDefinitionContract,
  RouteShadowOccurrenceEvidenceContract,
  RouteShadowOccurrenceLocationContract,
} from "./contracts";

type RouteShadowNestedIssue = { path: Array<string | number>; message: string };

export function validateNestedOccurrenceEvidence(
  evidence: RouteShadowOccurrenceEvidenceContract,
): RouteShadowNestedIssue[] {
  const issues: RouteShadowNestedIssue[] = [];
  const definitionById = new Map<string, RouteShadowOccurrenceDefinitionContract>();
  const occurrenceById = new Map<string, RouteShadowOccurrenceContract>();
  const issue = (path: Array<string | number>, message: string) => issues.push({ path, message });
  const reference = (path: Array<string | number>, id: string, kind: string) => {
    if (!occurrenceById.has(id)) issue(path, `${kind} does not reference an emitted occurrence: ${id}`);
    return occurrenceById.get(id) ?? null;
  };

  evidence.definitions.forEach((definition, index) => {
    if (definitionById.has(definition.id)) {
      issue(["definitions", index, "id"], `Definition ID is duplicated: ${definition.id}`);
    }
    definitionById.set(definition.id, definition);
  });
  evidence.occurrences.forEach((occurrence, index) => {
    if (occurrenceById.has(occurrence.id)) {
      issue(["occurrences", index, "id"], `Occurrence ID is duplicated: ${occurrence.id}`);
    }
    occurrenceById.set(occurrence.id, occurrence);
  });

  evidence.occurrences.forEach((occurrence, index) => {
    const definition = definitionById.get(occurrence.definitionId);
    if (!definition) {
      issue(["occurrences", index, "definitionId"], `Occurrence definition does not reference an emitted definition: ${occurrence.definitionId}`);
    } else {
      if (occurrence.definitionCompilerIdentity !== definition.compilerIdentity) {
        issue(["occurrences", index, "definitionCompilerIdentity"], `Occurrence compiler identity does not match its definition: ${occurrence.id}`);
      }
      if (occurrence.name !== definition.name) {
        issue(["occurrences", index, "name"], `Occurrence name does not match its definition: ${occurrence.id}`);
      }
    }
    if (occurrence.scopeId !== evidence.scopeId) {
      issue(["occurrences", index, "scopeId"], `Occurrence scope does not match occurrence evidence scope: ${occurrence.id}`);
    }
    if (occurrence.parentOccurrenceId === occurrence.id) {
      issue(["occurrences", index, "parentOccurrenceId"], `Occurrence cannot be its own parent: ${occurrence.id}`);
    } else if (occurrence.parentOccurrenceId !== null) {
      reference(["occurrences", index, "parentOccurrenceId"], occurrence.parentOccurrenceId, "Parent occurrence");
    }
    if (occurrence.ownership === "scope-entry" && occurrence.parentOccurrenceId !== null) {
      issue(["occurrences", index, "ownership"], `A scope-entry occurrence cannot have a parent: ${occurrence.id}`);
    }
    if (occurrence.ownership === "caller-owned" && occurrence.parentOccurrenceId === null) {
      issue(["occurrences", index, "parentOccurrenceId"], `A caller-owned occurrence must have a parent: ${occurrence.id}`);
    }
    validateCallerOwnedChildIds(
      occurrence.callerOwnedChildOccurrenceIds,
      occurrence.id,
      ["occurrences", index, "callerOwnedChildOccurrenceIds"],
      occurrenceById,
      issues,
      "Caller-owned child",
    );
  });
  evidence.occurrences.forEach((occurrence, index) => {
    if (occurrence.ownership !== "caller-owned" || occurrence.parentOccurrenceId === null) return;
    const parent = occurrenceById.get(occurrence.parentOccurrenceId);
    if (parent && !parent.callerOwnedChildOccurrenceIds.includes(occurrence.id)) {
      issue(["occurrences", index, "parentOccurrenceId"], `Parent occurrence does not list its caller-owned child: ${occurrence.id}`);
    }
  });

  const component = evidence.component;
  if (component) {
    const definition = definitionById.get(component.definition.id);
    const occurrence = occurrenceById.get(component.occurrence.id);
    if (!definition) {
      issue(["component", "definition", "id"], `Component definition does not reference an emitted definition: ${component.definition.id}`);
    } else if (!sameDefinitionIdentity(component.definition, definition)) {
      issue(["component", "definition"], `Component definition does not match its emitted definition: ${component.definition.id}`);
    }
    if (!occurrence) {
      issue(["component", "occurrence", "id"], `Component occurrence does not reference an emitted occurrence: ${component.occurrence.id}`);
    } else {
      if (component.definition.id !== component.occurrence.definitionId) {
        issue(["component", "occurrence", "definitionId"], `Component occurrence does not reference the component definition: ${component.occurrence.id}`);
      }
      if (component.occurrence.scopeId !== evidence.scopeId) {
        issue(["component", "occurrence", "scopeId"], `Component occurrence scope does not match occurrence evidence scope: ${component.occurrence.id}`);
      }
      if (!sameOccurrenceIdentity(component.occurrence, occurrence)) {
        issue(["component", "occurrence"], `Component occurrence does not match its emitted occurrence: ${component.occurrence.id}`);
      }
    }
    if (component.occurrence.ownership !== "scope-entry" || component.occurrence.parentOccurrenceId !== null) {
      issue(["component", "occurrence"], "The component occurrence must be the scope-entry occurrence.");
    }
  }

  const sourcePathIds = new Set<string>();
  evidence.sourcePath.occurrenceIds.forEach((id, index) => {
    if (sourcePathIds.has(id)) issue(["sourcePath", "occurrenceIds", index], `Source path occurrence ID is duplicated: ${id}`);
    sourcePathIds.add(id);
    reference(["sourcePath", "occurrenceIds", index], id, "Source path occurrence");
  });
  if (evidence.sourcePath.status === "proven") {
    if (evidence.sourcePath.occurrenceIds.length === 0) issue(["sourcePath", "occurrenceIds"], "A proven source path must emit at least one occurrence.");
    if (!evidence.sourcePath.sourceCompilerIdentity || !evidence.sourcePath.sourceLocation || !evidence.sourcePath.terminalLocation || !evidence.sourcePath.scopeId) {
      issue(["sourcePath"], "A proven source path must retain its compiler source, locations, and scope.");
    }
    if (evidence.sourcePath.scopeId !== evidence.scopeId) {
      issue(["sourcePath", "scopeId"], "Proven source path scope does not match occurrence evidence scope.");
    }
    if (evidence.terminal && evidence.sourcePath.terminalLocation && !sameLocation(evidence.terminal, evidence.sourcePath.terminalLocation)) {
      issue(["sourcePath", "terminalLocation"], "Source path terminal location does not match occurrence evidence terminal.");
    }
  } else if (evidence.sourcePath.occurrenceIds.length > 0) {
    issue(["sourcePath", "occurrenceIds"], "An unavailable or invalid source path cannot emit occurrence IDs.");
  }

  const selectedWrapper = evidence.selectedWrapperOccurrenceId === null
    ? null
    : reference(["selectedWrapperOccurrenceId"], evidence.selectedWrapperOccurrenceId, "Selected wrapper");
  const projection = evidence.projection;
  if (projection && evidence.selectedWrapperOccurrenceId === null) {
    issue(["projection"], "A projection must identify its selected wrapper occurrence.");
  }
  if (selectedWrapper && projection && projection.hiddenOccurrenceId !== selectedWrapper.id) {
    issue(["projection", "hiddenOccurrenceId"], "Projection hidden occurrence does not match the selected wrapper occurrence.");
  }
  if (selectedWrapper && !projection) {
    issue(["selectedWrapperOccurrenceId"], "A selected wrapper occurrence must have a projection.");
  }

  if (projection) {
    const hiddenWrapper = reference(["projection", "hiddenOccurrenceId"], projection.hiddenOccurrenceId, "Projection hidden wrapper");
    const reattachedIds = new Set<string>();
    projection.reattachedChildOccurrenceIds.forEach((id, index) => {
      if (reattachedIds.has(id)) issue(["projection", "reattachedChildOccurrenceIds", index], `Reattached child occurrence ID is duplicated: ${id}`);
      reattachedIds.add(id);
      const child = reference(["projection", "reattachedChildOccurrenceIds", index], id, "Reattached child");
      if (hiddenWrapper && child && !isCallerOwnedChild(hiddenWrapper, child)) {
        issue(["projection", "reattachedChildOccurrenceIds", index], `Reattached child is not a caller-owned child of the hidden wrapper: ${id}`);
      }
    });

    const visibleEdgeKeys = new Set<string>();
    projection.visibleEdges.forEach((edge, index) => {
      const key = `${edge.fromOccurrenceId}:${edge.toOccurrenceId}:${edge.kind}:${edge.hiddenWrapperOccurrenceId ?? ""}`;
      if (visibleEdgeKeys.has(key)) issue(["projection", "visibleEdges", index], `Projection edge is duplicated: ${key}`);
      visibleEdgeKeys.add(key);
      const from = reference(["projection", "visibleEdges", index, "fromOccurrenceId"], edge.fromOccurrenceId, "Projection edge source");
      const to = reference(["projection", "visibleEdges", index, "toOccurrenceId"], edge.toOccurrenceId, "Projection edge target");
      if (from && to && from.id === to.id) {
        issue(["projection", "visibleEdges", index], `Projection edge cannot target its source: ${from.id}`);
      }
      if (edge.kind === "render") {
        if (edge.hiddenWrapperOccurrenceId !== null) issue(["projection", "visibleEdges", index, "hiddenWrapperOccurrenceId"], "Render edges cannot reference a hidden wrapper.");
        if (edge.evidence.kind !== "parent-occurrence") issue(["projection", "visibleEdges", index, "evidence", "kind"], "Render edges require parent-occurrence evidence.");
        if (from && to && to.parentOccurrenceId !== from.id) {
          issue(["projection", "visibleEdges", index], `Render edge does not match the target parent occurrence: ${to.id}`);
        }
      } else {
        if (edge.hiddenWrapperOccurrenceId === null) {
          issue(["projection", "visibleEdges", index, "hiddenWrapperOccurrenceId"], "Transparent splice edges must reference a hidden wrapper.");
        } else {
          const edgeWrapper = reference(["projection", "visibleEdges", index, "hiddenWrapperOccurrenceId"], edge.hiddenWrapperOccurrenceId, "Visible edge hidden wrapper");
          if (edge.hiddenWrapperOccurrenceId !== projection.hiddenOccurrenceId) issue(["projection", "visibleEdges", index, "hiddenWrapperOccurrenceId"], "Visible edge hidden wrapper does not match the projection wrapper.");
          if (edgeWrapper && to && !isCallerOwnedChild(edgeWrapper, to)) issue(["projection", "visibleEdges", index, "toOccurrenceId"], `Transparent splice target is not a caller-owned child of the hidden wrapper: ${to.id}`);
          if (edgeWrapper && from && edgeWrapper.parentOccurrenceId !== from.id) issue(["projection", "visibleEdges", index, "fromOccurrenceId"], `Transparent splice source does not match the hidden wrapper parent: ${from.id}`);
        }
        if (edge.evidence.kind !== "transparent-wrapper-splice") issue(["projection", "visibleEdges", index, "evidence", "kind"], "Transparent splice edges require transparent-wrapper-splice evidence.");
        if (!reattachedIds.has(edge.toOccurrenceId)) issue(["projection", "visibleEdges", index, "toOccurrenceId"], `Transparent splice target is not listed as reattached: ${edge.toOccurrenceId}`);
      }
    });

    const hiddenPathWrapperIds = new Set<string>();
    projection.hiddenPaths.forEach((hiddenPath, index) => {
      if (hiddenPathWrapperIds.has(hiddenPath.wrapperOccurrenceId)) issue(["projection", "hiddenPaths", index, "wrapperOccurrenceId"], `Hidden path wrapper ID is duplicated: ${hiddenPath.wrapperOccurrenceId}`);
      hiddenPathWrapperIds.add(hiddenPath.wrapperOccurrenceId);
      const wrapper = reference(["projection", "hiddenPaths", index, "wrapperOccurrenceId"], hiddenPath.wrapperOccurrenceId, "Hidden path wrapper");
      const definition = definitionById.get(hiddenPath.definitionId);
      if (!definition) issue(["projection", "hiddenPaths", index, "definitionId"], `Hidden path definition does not reference an emitted definition: ${hiddenPath.definitionId}`);
      if (hiddenPath.wrapperOccurrenceId !== projection.hiddenOccurrenceId) issue(["projection", "hiddenPaths", index, "wrapperOccurrenceId"], "Hidden path wrapper does not match the projection wrapper.");
      if (wrapper) {
        if (hiddenPath.definitionId !== wrapper.definitionId) issue(["projection", "hiddenPaths", index, "definitionId"], `Hidden path definition does not match its wrapper: ${hiddenPath.wrapperOccurrenceId}`);
        if (hiddenPath.parentOccurrenceId !== wrapper.parentOccurrenceId) issue(["projection", "hiddenPaths", index, "parentOccurrenceId"], `Hidden path parent does not match its wrapper: ${hiddenPath.wrapperOccurrenceId}`);
        if (!sameLocation(hiddenPath.callSite, wrapper.callSite)) issue(["projection", "hiddenPaths", index, "callSite"], `Hidden path call site does not match its wrapper: ${hiddenPath.wrapperOccurrenceId}`);
        validateCallerOwnedChildIds(hiddenPath.callerOwnedChildOccurrenceIds, wrapper.id, ["projection", "hiddenPaths", index, "callerOwnedChildOccurrenceIds"], occurrenceById, issues, "Hidden path child");
        if (!hiddenPath.callerOwnedChildOccurrenceIds.every((id) => wrapper.callerOwnedChildOccurrenceIds.includes(id))) {
          issue(["projection", "hiddenPaths", index, "callerOwnedChildOccurrenceIds"], "Hidden path children must be listed by the wrapper occurrence.");
        }
        if (hiddenPath.sourcePathParticipates !== sourcePathIds.has(wrapper.id)) {
          issue(["projection", "hiddenPaths", index, "sourcePathParticipates"], `Hidden path source participation does not match the emitted source path: ${wrapper.id}`);
        }
      }
      const hiddenChildIds = new Set(hiddenPath.callerOwnedChildOccurrenceIds);
      const hiddenEdgeKeys = new Set<string>();
      hiddenPath.hiddenEdges.forEach((edge, edgeIndex) => {
        const key = `${edge.fromOccurrenceId}:${edge.toOccurrenceId}`;
        if (hiddenEdgeKeys.has(key)) issue(["projection", "hiddenPaths", index, "hiddenEdges", edgeIndex], `Hidden path edge is duplicated: ${key}`);
        hiddenEdgeKeys.add(key);
        const from = reference(["projection", "hiddenPaths", index, "hiddenEdges", edgeIndex, "fromOccurrenceId"], edge.fromOccurrenceId, "Hidden path edge source");
        const to = reference(["projection", "hiddenPaths", index, "hiddenEdges", edgeIndex, "toOccurrenceId"], edge.toOccurrenceId, "Hidden path edge target");
        if (from && from.id !== hiddenPath.wrapperOccurrenceId) issue(["projection", "hiddenPaths", index, "hiddenEdges", edgeIndex, "fromOccurrenceId"], "Hidden path edge source must be its wrapper.");
        if (to && (!hiddenChildIds.has(to.id) || !isCallerOwnedChild(wrapper, to))) issue(["projection", "hiddenPaths", index, "hiddenEdges", edgeIndex, "toOccurrenceId"], "Hidden path edge target must be a listed caller-owned wrapper child.");
      });
    });
  }

  const siblingIsolation = evidence.siblingIsolation;
  if (siblingIsolation) {
    const selected = reference(["siblingIsolation", "selectedWrapperOccurrenceId"], siblingIsolation.selectedWrapperOccurrenceId, "Sibling selected wrapper");
    const sibling = reference(["siblingIsolation", "siblingWrapperOccurrenceId"], siblingIsolation.siblingWrapperOccurrenceId, "Sibling wrapper");
    if (selected && sibling) {
      if (selected.id === sibling.id) issue(["siblingIsolation", "siblingWrapperOccurrenceId"], "Sibling isolation wrappers must be distinct.");
      if ((selected.definitionId === sibling.definitionId) !== siblingIsolation.sameDefinition) {
        issue(["siblingIsolation", "sameDefinition"], "Sibling isolation sameDefinition does not match wrapper definitions.");
      }
      if (selected.parentOccurrenceId !== sibling.parentOccurrenceId) issue(["siblingIsolation"], "Sibling isolation wrappers must share a parent occurrence.");
      if (evidence.selectedWrapperOccurrenceId !== selected.id) issue(["siblingIsolation", "selectedWrapperOccurrenceId"], "Sibling selected wrapper does not match occurrence evidence.");
      if (projection && projection.hiddenOccurrenceId !== selected.id) issue(["siblingIsolation", "selectedWrapperOccurrenceId"], "Sibling selected wrapper does not match projection hidden occurrence.");
    }
    validateCallerOwnedChildIds(siblingIsolation.selectedChildOccurrenceIds, siblingIsolation.selectedWrapperOccurrenceId, ["siblingIsolation", "selectedChildOccurrenceIds"], occurrenceById, issues, "Selected sibling-isolation child");
    validateCallerOwnedChildIds(siblingIsolation.siblingChildOccurrenceIds, siblingIsolation.siblingWrapperOccurrenceId, ["siblingIsolation", "siblingChildOccurrenceIds"], occurrenceById, issues, "Sibling-isolation child");
    const selectedChildIds = new Set(siblingIsolation.selectedChildOccurrenceIds);
    if (siblingIsolation.siblingChildOccurrenceIds.some((id) => selectedChildIds.has(id))) {
      issue(["siblingIsolation"], "Sibling isolation child sets must remain separate.");
    }
    if (siblingIsolation.siblingInSourcePath !== sourcePathIds.has(siblingIsolation.siblingWrapperOccurrenceId)) {
      issue(["siblingIsolation", "siblingInSourcePath"], "Sibling source-path status does not match the emitted source path.");
    }
    const reattachedIds = new Set(projection?.reattachedChildOccurrenceIds ?? []);
    const receivedSelectedChildren = siblingIsolation.siblingChildOccurrenceIds.some((id) => reattachedIds.has(id)) || reattachedIds.has(siblingIsolation.siblingWrapperOccurrenceId);
    if (siblingIsolation.siblingReceivedSelectedChildren !== receivedSelectedChildren) {
      issue(["siblingIsolation", "siblingReceivedSelectedChildren"], "Sibling child-receipt status does not match the emitted reattachment set.");
    }
  }
  return issues;
}

function validateCallerOwnedChildIds(
  childIds: readonly string[],
  ownerId: string,
  path: Array<string | number>,
  occurrenceById: ReadonlyMap<string, RouteShadowOccurrenceContract>,
  issues: RouteShadowNestedIssue[],
  label: string,
) {
  const seen = new Set<string>();
  childIds.forEach((childId, index) => {
    if (seen.has(childId)) issues.push({ path: [...path, index], message: `${label} ID is duplicated: ${childId}` });
    seen.add(childId);
    const child = occurrenceById.get(childId);
    if (!child) {
      issues.push({ path: [...path, index], message: `${label} does not reference an emitted occurrence: ${childId}` });
    } else if (child.parentOccurrenceId !== ownerId || child.ownership !== "caller-owned") {
      issues.push({ path: [...path, index], message: `${label} does not reference a direct caller-owned child of ${ownerId}: ${childId}` });
    }
  });
}

function isCallerOwnedChild(parent: RouteShadowOccurrenceContract | null, child: RouteShadowOccurrenceContract) {
  return Boolean(parent && child.parentOccurrenceId === parent.id && child.ownership === "caller-owned");
}

function sameDefinitionIdentity(
  left: RouteShadowOccurrenceDefinitionContract,
  right: RouteShadowOccurrenceDefinitionContract,
) {
  return left.id === right.id
    && left.name === right.name
    && left.compilerIdentity === right.compilerIdentity
    && left.importModule === right.importModule
    && sameNullableLocation(left.declaration, right.declaration);
}

function sameOccurrenceIdentity(left: RouteShadowOccurrenceContract, right: RouteShadowOccurrenceContract) {
  return left.id === right.id
    && left.callSiteId === right.callSiteId
    && left.definitionId === right.definitionId
    && left.definitionCompilerIdentity === right.definitionCompilerIdentity
    && left.name === right.name
    && left.parentOccurrenceId === right.parentOccurrenceId
    && left.scopeId === right.scopeId
    && sameLocation(left.callSite, right.callSite)
    && left.ownership === right.ownership
    && left.repetition === right.repetition
    && left.callerOwnedChildOccurrenceIds.length === right.callerOwnedChildOccurrenceIds.length
    && left.callerOwnedChildOccurrenceIds.every((id) => right.callerOwnedChildOccurrenceIds.includes(id));
}

function sameNullableLocation(
  left: RouteShadowOccurrenceLocationContract | null,
  right: RouteShadowOccurrenceLocationContract | null,
) {
  return left === null ? right === null : right !== null && sameLocation(left, right);
}

function sameLocation(left: RouteShadowOccurrenceLocationContract, right: RouteShadowOccurrenceLocationContract) {
  return left.file === right.file
    && left.line === right.line
    && left.column === right.column
    && left.span.startLine === right.span.startLine
    && left.span.startColumn === right.span.startColumn
    && left.span.endLine === right.span.endLine
    && left.span.endColumn === right.span.endColumn;
}
