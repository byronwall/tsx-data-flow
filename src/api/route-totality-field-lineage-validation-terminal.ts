import type { AnalysisCancellationToken } from "../analysis/cancellation";
import { cancellableStableSort } from "../analysis/cancellable-stable-sort";
import {
  classifyRouteTotalityFieldTransition,
  isFullyProvenElement,
} from "../analysis/route-totality-field-lineage-transition";
import type { ValidationIssue } from "./route-occurrence-validation-graph";
import { addIssue } from "./route-occurrence-validation-graph";
import {
  endpointTerminalAnchors,
  exactElement,
  fullyProvenTerminal,
  type EvidenceElement,
  type EvidenceIndexes,
  type FieldAttachment,
  type SurfaceIndexes,
  type SurfaceOccurrence,
} from "./route-totality-field-lineage-validation-index";

export function validateFieldLineageAttachmentTerminals(
  attachment: FieldAttachment,
  origin: EvidenceElement | undefined,
  occurrence: SurfaceOccurrence | undefined,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  path: Array<string | number>,
  issues: ValidationIssue[],
  cancellation: AnalysisCancellationToken,
): void {
  cancellation.throwIfCancelled();
  for (const terminalId of attachment.terminalIds) {
    cancellation.throwIfCancelled();
    const terminals = surface.terminalsById.get(terminalId) ?? [];
    if (terminals.length !== 1) {
      addIssue(issues, [...path, "terminalIds"], `field attachment terminal "${terminalId}" must exist exactly once`);
      continue;
    }
    const terminal = terminals[0];
    const anchors = endpointTerminalAnchors(surface.anchors, terminalId, cancellation);
    if (anchors.length !== 1 || surface.anchors.terminalIssuesByEndpointId.has(terminalId)) {
      addIssue(issues, [...path, "terminalIds"], "field terminal must have one unshared exact evidence anchor");
      continue;
    }
    const reverse = surface.anchors.terminalAnchorsByEvidenceElementId.get(anchors[0].evidenceElementId) ?? [];
    const anchorElement = exactElement(evidence, anchors[0].evidenceElementId);
    if (reverse.length !== 1 || !anchorElement || !isFullyProvenElement(anchorElement, cancellation)) {
      addIssue(issues, [...path, "terminalIds"], "field terminal anchor must be uniquely and fully proven");
    }
    if (!occurrence || terminal.ownerOccurrenceId !== occurrence.id) {
      addIssue(issues, [...path, "terminalIds"], "field terminal must be render-owned by its attachment occurrence");
    }
    const terminalRecords = evidence.terminalsByKey.get(`${anchors[0].evidenceElementId}:render`) ?? [];
    if (terminalRecords.length !== 1 || !fullyProvenTerminal(terminalRecords[0], cancellation)) {
      addIssue(issues, [...path, "terminalIds"], "field terminal must have one fully proven render evidence record");
    }
    if (!origin || !occurrence || !terminalReachableThroughExactPolicy(
      attachment,
      terminalId,
      origin,
      evidence,
      surface,
      cancellation,
    )) {
      addIssue(issues, [...path, "terminalIds"], "field terminal must be reachable through the exact occurrence-aware transition policy");
    }
  }
  cancellation.throwIfCancelled();
}

function terminalReachableThroughExactPolicy(
  attachment: FieldAttachment,
  terminalId: string,
  origin: EvidenceElement,
  evidence: EvidenceIndexes,
  surface: SurfaceIndexes,
  cancellation: AnalysisCancellationToken,
): boolean {
  cancellation.throwIfCancelled();
  const queue: Array<{ elementId: string; occurrenceId: string | null; fieldIndex: number; pathIds: string[] }> = [{
    elementId: origin.id,
    occurrenceId: surface.rootOccurrenceId,
    fieldIndex: 0,
    pathIds: [origin.id],
  }];
  const visited = new Set<string>();
  while (queue.length > 0) {
    cancellation.throwIfCancelled();
    const sorted = cancellableStableSort(
      queue,
      (left, right) => stateKey(left).localeCompare(stateKey(right)),
      cancellation,
    );
    queue.length = 0;
    for (const item of sorted) {
      cancellation.throwIfCancelled();
      queue.push(item);
    }
    const state = queue.shift();
    if (!state) continue;
    const key = stateKey(state);
    if (visited.has(key)) continue;
    visited.add(key);
    const source = exactElement(evidence, state.elementId);
    if (!source || !isFullyProvenElement(source, cancellation)) continue;
    const outgoing = evidence.outgoing.get(source.id) ?? [];
    for (const relation of outgoing) {
      cancellation.throwIfCancelled();
      const target = exactElement(evidence, relation.to);
      if (!target) continue;
      const occurrenceAnchors = surface.anchors.occurrenceAnchorsByEvidenceElementId.get(target.id) ?? [];
      const terminalAnchors = surface.anchors.terminalAnchorsByEvidenceElementId.get(target.id) ?? [];
      const terminal = terminalAnchors.length === 1 ? terminalAnchors[0].endpoint : undefined;
      const transition = classifyRouteTotalityFieldTransition({
        relation,
        source,
        target,
        outgoingRelations: outgoing,
        incomingRelations: evidence.incoming.get(target.id) ?? [],
        hasField: state.fieldIndex > 0,
        isInitialOrigin: state.elementId === attachment.origin.elementId && state.pathIds.length === 1,
        staticNamedField: target.fieldName !== null,
        occurrenceAnchorCount: occurrenceAnchors.length,
        terminalAnchorCount: terminalAnchors.length,
        currentOccurrenceId: state.occurrenceId,
        terminalOwnerOccurrenceId: terminal?.ownerOccurrenceId,
        cancellation,
      });
      if (transition.kind === "stop" || containsId(state.pathIds, target.id, cancellation)) continue;
      if (transition.kind === "field-input") {
        if (target.id !== attachment.field.elementIds[state.fieldIndex]) continue;
        queue.push(nextState(state, target.id, state.occurrenceId, state.fieldIndex + 1, cancellation));
        continue;
      }
      if (transition.kind === "preserve") {
        queue.push(nextState(state, target.id, state.occurrenceId, state.fieldIndex, cancellation));
        continue;
      }
      if (transition.kind === "render-terminal"
        && state.fieldIndex === attachment.field.elementIds.length
        && terminalAnchors[0]?.endpoint.id === terminalId
        && state.occurrenceId === attachment.occurrenceId) {
        cancellation.throwIfCancelled();
        return true;
      }
    }
  }
  cancellation.throwIfCancelled();
  return false;
}

function nextState(
  state: { elementId: string; occurrenceId: string | null; fieldIndex: number; pathIds: string[] },
  elementId: string,
  occurrenceId: string | null,
  fieldIndex: number,
  cancellation: AnalysisCancellationToken,
) {
  cancellation.throwIfCancelled();
  const pathIds: string[] = [];
  for (const pathId of state.pathIds) {
    cancellation.throwIfCancelled();
    pathIds.push(pathId);
  }
  pathIds.push(elementId);
  cancellation.throwIfCancelled();
  return { elementId, occurrenceId, fieldIndex, pathIds };
}

function containsId(ids: readonly string[], id: string, cancellation: AnalysisCancellationToken): boolean {
  cancellation.throwIfCancelled();
  for (const candidate of ids) {
    cancellation.throwIfCancelled();
    if (candidate === id) return true;
  }
  cancellation.throwIfCancelled();
  return false;
}

function stateKey(state: { elementId: string; occurrenceId: string | null; fieldIndex: number }): string {
  return `${state.elementId}:${state.occurrenceId ?? ""}:${state.fieldIndex}`;
}
