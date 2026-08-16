import type { EvidenceSlice, RouteOccurrenceSurface } from "./route-totality-contracts";
import { NO_ANALYSIS_CANCELLATION, type AnalysisCancellationToken } from "../analysis/cancellation";

export type ValidationIssue = {
  path: Array<string | number>;
  message: string;
};

export const addIssue = (
  issues: ValidationIssue[],
  path: Array<string | number>,
  message: string,
): void => {
  issues.push({ path, message });
};

export const prefixIssues = (
  issues: ValidationIssue[],
  prefix: Array<string | number>,
  nested: ValidationIssue[],
): void => {
  for (const issue of nested) addIssue(issues, [...prefix, ...issue.path], issue.message);
};

export const uniqueKeys = <T>(
  values: T[],
  path: Array<string | number>,
  keyOf: (value: T) => string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): Set<string> => {
  const keys = new Set<string>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    const key = keyOf(value);
    if (keys.has(key)) addIssue(issues, [...path, index], `duplicate identity "${key}"`);
    keys.add(key);
  });
  return keys;
};

export const uniqueIdentity = <T>(
  values: T[],
  path: Array<string | number>,
  identityOf: (value: T) => string,
  idOf: (value: T) => string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): void => {
  const identities = new Map<string, { id: string; index: number }>();
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    const identity = identityOf(value);
    const id = idOf(value);
    const previous = identities.get(identity);
    if (previous !== undefined && previous.id !== id) {
      addIssue(
        issues,
        [...path, index],
        `identity maps to multiple ids; first appears at index ${previous.index}`,
      );
    } else {
      identities.set(identity, { id, index });
    }
  });
};

export const indexIds = <T>(
  values: T[],
  path: Array<string | number>,
  idOf: (value: T) => string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): Map<string, number> => {
  const index = new Map<string, number>();
  values.forEach((value, position) => {
    cancellation.throwIfCancelled();
    const id = idOf(value);
    const previous = index.get(id);
    if (previous !== undefined) {
      addIssue(issues, [...path, position], `duplicate id "${id}"; first appears at ${previous}`);
    } else {
      index.set(id, position);
    }
  });
  return index;
};

export const requireReference = (
  value: string | null,
  references: Set<string>,
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
): void => {
  if (value !== null && !references.has(value)) {
    addIssue(issues, path, `${label} references unknown id "${value}"`);
  }
};

export const validateReferenceList = (
  values: string[],
  references: Set<string>,
  path: Array<string | number>,
  label: string,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): void => {
  uniqueKeys(values, path, (value) => value, issues, cancellation);
  values.forEach((value, index) => {
    cancellation.throwIfCancelled();
    requireReference(value, references, [...path, index], label, issues);
  });
};

export const validateRepetition = (
  repetition: string,
  markers: string[],
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): void => {
  cancellation.throwIfCancelled();
  uniqueKeys(markers, [...path, "repetitionMarkers"], (value) => value, issues, cancellation);
  if (repetition === "single" && markers.length > 0) {
    addIssue(issues, path, "single items cannot carry repetition markers");
  }
  if (repetition === "conditional" && !markers.includes("conditional")) {
    addIssue(issues, path, "conditional repetition requires a conditional marker");
  }
  if (repetition === "collection" && !markers.includes("collection")) {
    addIssue(issues, path, "collection repetition requires a collection marker");
  }
};

export const validateEvidenceReferences = (
  slice: EvidenceSlice,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const elementIndex = indexIds(slice.elements, ["elements"], (value) => value.id, issues, cancellation);
  indexIds(slice.relations, ["relations"], (value) => value.id, issues, cancellation);
  uniqueKeys(slice.origins, ["origins"], (value) => `${value.elementId}:${value.role}`, issues, cancellation);
  uniqueKeys(slice.terminals, ["terminals"], (value) => `${value.elementId}:${value.role}`, issues, cancellation);
  indexIds(slice.gaps, ["gaps"], (value) => value.id, issues, cancellation);
  uniqueIdentity(
    slice.elements,
    ["elements"],
    (value) => JSON.stringify([
      value.kind,
      value.source.file,
      value.source.start,
      value.source.end,
      value.symbol,
      value.componentBinding,
      value.proof.map((proof) => [
        proof.kind,
        proof.detail,
        proof.status,
        proof.locations.map((location) => [
          location.file,
          location.span.startLine,
          location.span.startColumn,
          location.span.endLine,
          location.span.endColumn,
        ]),
      ]),
    ]),
    (value) => value.id,
    issues,
    cancellation,
  );
  const elementIds = new Set(elementIndex.keys());
  slice.relations.forEach((relation, index) => {
    cancellation.throwIfCancelled();
    requireReference(relation.from, elementIds, ["relations", index, "from"], "relation.from", issues);
    requireReference(relation.to, elementIds, ["relations", index, "to"], "relation.to", issues);
    if (relation.proof.locations.length === 0) addIssue(issues, ["relations", index, "proof", "locations"], "relation proof must contain a source location");
  });
  slice.origins.forEach((origin, index) => {
    cancellation.throwIfCancelled();
    requireReference(origin.elementId, elementIds, ["origins", index, "elementId"], "origin.elementId", issues);
  });
  slice.terminals.forEach((terminal, index) => {
    cancellation.throwIfCancelled();
    requireReference(terminal.elementId, elementIds, ["terminals", index, "elementId"], "terminal.elementId", issues);
  });
  slice.gaps.forEach((gap, index) => {
    cancellation.throwIfCancelled();
    requireReference(gap.from, elementIds, ["gaps", index, "from"], "gap.from", issues);
    requireReference(gap.to, elementIds, ["gaps", index, "to"], "gap.to", issues);
  });
  return issues;
};

const validateParentCycles = (
  occurrences: RouteOccurrenceSurface["occurrences"],
  index: Map<string, number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void => {
  occurrences.forEach((occurrence, start) => {
    cancellation.throwIfCancelled();
    const seen = new Set<string>();
    let current: string | null = occurrence.id;
    while (current !== null) {
      cancellation.throwIfCancelled();
      if (seen.has(current)) {
        addIssue(issues, ["occurrences", start, "parentOccurrenceId"], "parent links contain a cycle");
        break;
      }
      seen.add(current);
      const position = index.get(current);
      if (position === undefined) break;
      current = occurrences[position].parentOccurrenceId;
    }
  });
};

const validateCallSiteConsistency = (
  occurrences: RouteOccurrenceSurface["occurrences"],
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void => {
  const identities = new Map<string, { identity: string; index: number }>();
  occurrences.forEach((occurrence, index) => {
    cancellation.throwIfCancelled();
    const span = occurrence.callSite.span;
    const identity = JSON.stringify([
      occurrence.callSite.file,
      span.startLine,
      span.startColumn,
      span.endLine,
      span.endColumn,
      occurrence.scopeId,
      occurrence.scopeSeed,
      occurrence.definitionId,
      occurrence.definitionSourceIdentity,
      occurrence.definitionCompilerIdentity,
    ]);
    const previous = identities.get(occurrence.callSiteId);
    if (previous !== undefined && previous.identity !== identity) {
      addIssue(
        issues,
        ["occurrences", index, "callSiteId"],
        `call site id maps to a different source, scope, or definition; first appears at index ${previous.index}`,
      );
    } else if (previous === undefined) {
      identities.set(occurrence.callSiteId, { identity, index });
    }
  });
};

export const validateOccurrenceReferences = (
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const definitions = indexIds(surface.definitions, ["definitions"], (value) => value.id, issues, cancellation);
  const occurrences = indexIds(surface.occurrences, ["occurrences"], (value) => value.id, issues, cancellation);
  const boundaries = indexIds(surface.frameworkBoundaries, ["frameworkBoundaries"], (value) => value.id, issues, cancellation);
  const slots = indexIds(surface.slotForwarding, ["slotForwarding"], (value) => value.id, issues, cancellation);
  indexIds(surface.renderEdges, ["renderEdges"], (value) => value.id, issues, cancellation);
  indexIds(surface.terminals, ["terminals"], (value) => value.id, issues, cancellation);
  indexIds(surface.omissions, ["omissions"], (value) => value.id, issues, cancellation);
  uniqueKeys(surface.origins, ["origins"], (value) => `${value.elementId}:${value.role}`, issues, cancellation);
  uniqueKeys(
    surface.hiddenWrapperCompatibility,
    ["hiddenWrapperCompatibility"],
    (value) => value.occurrenceId,
    issues,
    cancellation,
  );
  uniqueKeys(surface.occurrences, ["occurrences"], (value) => value.key, issues, cancellation);
  validateCallSiteConsistency(surface.occurrences, issues, cancellation);
  uniqueKeys(
    surface.occurrences,
    ["occurrences"],
    (value) => `${value.definitionId}:${value.callSiteId}:${value.parentOccurrenceId ?? "scope-root"}:${value.scopeId}`,
    issues,
    cancellation,
  );
  uniqueIdentity(
    surface.definitions,
    ["definitions"],
    (value) => `${value.compilerIdentity}:${value.sourceIdentity}`,
    (value) => value.id,
    issues,
    cancellation,
  );
  // TypeScript can report different local wrapper symbols with the same bare
  // name (for example, two HOC-backed `Root` declarations). The source
  // identity is part of the definition identity, so keep those definitions
  // distinct while still rejecting duplicate definition records.
  uniqueKeys(surface.definitions, ["definitions"], (value) => `${value.compilerIdentity}:${value.sourceIdentity}`, issues, cancellation);
  uniqueKeys(surface.definitions, ["definitions"], (value) => value.sourceIdentity, issues, cancellation);

  const definitionIds = new Set(definitions.keys());
  const occurrenceIds = new Set(occurrences.keys());
  const boundaryIds = new Set(boundaries.keys());
  const nodeIds = new Set([...occurrenceIds, ...boundaryIds]);
  const slotIds = new Set(slots.keys());
  const childLinks = new Map<string, { parent: string; ownership: string }>();

  const listChildren = (
    parentId: string,
    values: string[],
    path: Array<string | number>,
    ownership: "caller-owned" | "definition-owned",
  ): void => {
    validateReferenceList(values, occurrenceIds, path, "child occurrence", issues, cancellation);
    values.forEach((childId, childIndex) => {
      cancellation.throwIfCancelled();
      const previous = childLinks.get(childId);
      if (previous !== undefined && (previous.parent !== parentId || previous.ownership !== ownership)) {
        addIssue(issues, [...path, childIndex], "ordinary occurrence has more than one parent or owner list");
      } else {
        childLinks.set(childId, { parent: parentId, ownership });
      }
      const childPosition = occurrences.get(childId);
      if (childPosition === undefined) return;
      const child = surface.occurrences[childPosition];
      if (child.parentOccurrenceId !== parentId) addIssue(issues, [...path, childIndex], "child list disagrees with parentOccurrenceId");
      if (child.ownership !== ownership) addIssue(issues, [...path, childIndex], `child list requires ${ownership} ownership`);
    });
  };

  validateParentCycles(surface.occurrences, occurrences, issues, cancellation);
  surface.occurrences.forEach((occurrence, index) => {
    cancellation.throwIfCancelled();
    const path = ["occurrences", index] as Array<string | number>;
    requireReference(occurrence.definitionId, definitionIds, [...path, "definitionId"], "definitionId", issues);
    requireReference(occurrence.parentOccurrenceId, occurrenceIds, [...path, "parentOccurrenceId"], "parentOccurrenceId", issues);
    requireReference(occurrence.renderParentId, nodeIds, [...path, "renderParentId"], "renderParentId", issues);
    validateReferenceList(occurrence.slotForwardingIds, slotIds, [...path, "slotForwardingIds"], "slot forwarding", issues, cancellation);
    validateReferenceList(occurrence.frameworkBoundaryIds, boundaryIds, [...path, "frameworkBoundaryIds"], "framework boundary", issues, cancellation);
    validateRepetition(occurrence.repetition, occurrence.repetitionMarkers, path, issues, cancellation);
    if (occurrence.parentOccurrenceId === null && occurrence.ownership !== "scope-entry") addIssue(issues, path, "ordinary occurrence must have one parent");
    if (occurrence.parentOccurrenceId !== null && occurrence.ownership === "scope-entry") addIssue(issues, path, "scope-entry occurrence cannot have an occurrence parent");
    if (occurrence.scopeId !== surface.scope.id || occurrence.scopeSeed !== surface.scope.seed) addIssue(issues, path, "occurrence scope identity does not match the surface");
    const definitionPosition = definitions.get(occurrence.definitionId);
    if (definitionPosition !== undefined) {
      const definition = surface.definitions[definitionPosition];
      if (occurrence.definitionSourceIdentity !== definition.sourceIdentity) addIssue(issues, [...path, "definitionSourceIdentity"], "source identity does not match definition");
      if (occurrence.definitionCompilerIdentity !== definition.compilerIdentity) addIssue(issues, [...path, "definitionCompilerIdentity"], "compiler identity does not match definition");
      if (occurrence.name !== definition.name) addIssue(issues, [...path, "name"], "occurrence name does not match definition");
    }
    listChildren(occurrence.id, occurrence.callerOwnedChildOccurrenceIds, [...path, "callerOwnedChildOccurrenceIds"], "caller-owned");
    listChildren(occurrence.id, occurrence.definitionOwnedChildOccurrenceIds, [...path, "definitionOwnedChildOccurrenceIds"], "definition-owned");
  });
  surface.occurrences.forEach((occurrence, index) => {
    cancellation.throwIfCancelled();
    if (occurrence.parentOccurrenceId !== null && childLinks.get(occurrence.id)?.parent !== occurrence.parentOccurrenceId) {
      addIssue(issues, ["occurrences", index, "parentOccurrenceId"], "parent is not represented by the parent's child list");
    }
  });

  surface.frameworkBoundaries.forEach((boundary, index) => {
    cancellation.throwIfCancelled();
    const path = ["frameworkBoundaries", index] as Array<string | number>;
    requireReference(boundary.parentOccurrenceId, occurrenceIds, [...path, "parentOccurrenceId"], "boundary parent", issues);
    requireReference(boundary.renderParentId, nodeIds, [...path, "renderParentId"], "boundary render parent", issues);
    validateRepetition(boundary.repetition, boundary.repetitionMarkers, path, issues, cancellation);
    validateReferenceList(boundary.childOccurrenceIds, occurrenceIds, [...path, "childOccurrenceIds"], "boundary child", issues, cancellation);
    validateReferenceList(boundary.fallbackChildOccurrenceIds, occurrenceIds, [...path, "fallbackChildOccurrenceIds"], "boundary fallback child", issues, cancellation);
    if (boundary.condition?.outcome === "falsey" && boundary.childOccurrenceIds.length > 0) addIssue(issues, [...path, "childOccurrenceIds"], "a proven falsey boundary cannot retain content children");
    if (boundary.condition?.outcome === "truthy" && boundary.fallbackChildOccurrenceIds.length > 0) addIssue(issues, [...path, "fallbackChildOccurrenceIds"], "a proven truthy boundary cannot retain fallback children");
    [...boundary.childOccurrenceIds, ...boundary.fallbackChildOccurrenceIds].forEach((childId, childIndex) => {
      cancellation.throwIfCancelled();
      const childPosition = occurrences.get(childId);
      if (childPosition !== undefined && !surface.occurrences[childPosition].frameworkBoundaryIds.includes(boundary.id)) {
        addIssue(issues, [...path, "childOccurrenceIds", childIndex], "boundary child does not reference its boundary");
      }
    });
    if (boundary.scopeId !== surface.scope.id || boundary.scopeSeed !== surface.scope.seed) addIssue(issues, path, "boundary scope identity does not match the surface");
  });

  const edgeGraph = new Map<string, string[]>();
  surface.renderEdges.forEach((edge, index) => {
    cancellation.throwIfCancelled();
    requireReference(edge.from, nodeIds, ["renderEdges", index, "from"], "edge.from", issues);
    requireReference(edge.to, nodeIds, ["renderEdges", index, "to"], "edge.to", issues);
    if (edge.from === edge.to) addIssue(issues, ["renderEdges", index], "render graph cannot contain a self-cycle");
    const targets = edgeGraph.get(edge.from) ?? [];
    targets.push(edge.to);
    edgeGraph.set(edge.from, targets);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string, path: string[]): void => {
    cancellation.throwIfCancelled();
    if (visiting.has(node)) {
      addIssue(issues, ["renderEdges"], `render graph contains a directed cycle: ${[...path, node].join(" -> ")}`);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const target of edgeGraph.get(node) ?? []) visit(target, [...path, node]);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of nodeIds) {
    cancellation.throwIfCancelled();
    visit(node, []);
  }
  surface.slotForwarding.forEach((slot, index) => {
    cancellation.throwIfCancelled();
    const path = ["slotForwarding", index] as Array<string | number>;
    requireReference(slot.occurrenceId, occurrenceIds, [...path, "occurrenceId"], "slot occurrence", issues);
    validateReferenceList(slot.callerChildOccurrenceIds, occurrenceIds, [...path, "callerChildOccurrenceIds"], "slot child", issues, cancellation);
    const occurrencePosition = occurrences.get(slot.occurrenceId);
    if (occurrencePosition !== undefined) {
      const occurrence = surface.occurrences[occurrencePosition];
      if (slot.definitionSourceIdentity !== occurrence.definitionSourceIdentity) addIssue(issues, [...path, "definitionSourceIdentity"], "slot definition identity does not match occurrence");
      if (!occurrence.slotForwardingIds.includes(slot.id)) addIssue(issues, [...path, "id"], "slot is not listed by its occurrence");
      slot.callerChildOccurrenceIds.forEach((childId, childIndex) => {
        cancellation.throwIfCancelled();
        const childPosition = occurrences.get(childId);
        if (childPosition !== undefined && surface.occurrences[childPosition].parentOccurrenceId !== slot.occurrenceId) addIssue(issues, [...path, "callerChildOccurrenceIds", childIndex], "slot child has a different parent");
      });
    }
  });
  surface.terminals.forEach((terminal, index) => {
    cancellation.throwIfCancelled();
    const path = ["terminals", index] as Array<string | number>;
    requireReference(terminal.ownerOccurrenceId, occurrenceIds, [...path, "ownerOccurrenceId"], "terminal owner", issues);
    requireReference(terminal.renderParentId, nodeIds, [...path, "renderParentId"], "terminal render parent", issues);
  });
  surface.hiddenWrapperCompatibility.forEach((wrapper, index) => {
    cancellation.throwIfCancelled();
    const path = ["hiddenWrapperCompatibility", index] as Array<string | number>;
    requireReference(wrapper.occurrenceId, occurrenceIds, [...path, "occurrenceId"], "wrapper occurrence", issues);
    requireReference(wrapper.definitionId, definitionIds, [...path, "definitionId"], "wrapper definition", issues);
    const occurrencePosition = occurrences.get(wrapper.occurrenceId);
    if (occurrencePosition !== undefined) {
      const occurrence = surface.occurrences[occurrencePosition];
      if (occurrence.definitionId !== wrapper.definitionId) addIssue(issues, [...path, "definitionId"], "wrapper definition does not match occurrence");
      if (!occurrence.hiddenWrapperCompatibility) addIssue(issues, [...path, "occurrenceId"], "occurrence is not marked hidden-wrapper compatible");
    }
  });
  return issues;
};
