import type { AnalysisCancellationToken } from "./cancellation";
import { coverageFor } from "./evidence-slice-coverage";
import { buildRouteTotalityAnchorIndex } from "./route-totality-anchor-index";
import type { RouteTotalityFieldLineage, RouteTotalityFieldOrigin, RouteTotalityFieldTransformation } from "./route-totality-field-lineage";
import { discoverFieldProofCandidates, type FieldProofCandidate } from "./route-totality-field-proof-candidate";
import { searchFieldCarrierPaths, type FieldCarrierPath } from "./route-totality-field-proof-carrier";
import { RouteTotalityFieldProofIndex } from "./route-totality-field-proof-index";
import { failedFieldProof, mergeProvenFieldProofs, provenFieldProof } from "./route-totality-field-proof-result";
import { DIRECT_FIELD_PROOF_TARGETS } from "./route-totality-field-proof-policy";
import { assembleFieldProofTransformations } from "./route-totality-field-proof-transformations";
import type { FieldProofInput } from "./route-totality-field-proof-types";
import {
  deriveExactFieldTargetPolicy,
  EXACT_FIELD_TRANSFER_KINDS,
  verifyExactFieldTransfer,
  type ExactFieldTransferKind,
} from "./route-totality-field-transfer-verifier";

/** Query one exact compiler-backed transfer ledger for the selected source. */
export function queryRouteTotalityFieldProof(
  input: FieldProofInput,
  cancellation: AnalysisCancellationToken,
): RouteTotalityFieldLineage | null {
  const { ts, program, root, provider, slice, surface, selectedSource } = input;
  const index = new RouteTotalityFieldProofIndex(root, provider, slice);
  const selectedInput = selectedSource.evidence ? index.selectedFilesystemInput(selectedSource.evidence) : { kind: "unresolved" as const };
  if (selectedInput.kind === "unresolved" || !selectedSource.evidence) return null;
  const origin = selectedFilesystemOrigin(index, selectedInput.element, selectedSource.evidence.id);
  if (selectedInput.kind === "ambiguous") {
    augmentSlice(index, cancellation);
    return failedFieldProof(
      origin,
      selectedInput.element,
      "source-carrier",
      [],
      "More than one proven filesystem input occupies the selected evidence span.",
      cancellation,
      "ambiguous-target",
    );
  }
  const candidates = DIRECT_FIELD_PROOF_TARGETS.flatMap((target) => discoverFieldProofCandidates(ts, program, root, index, target, cancellation))
    .flatMap((candidate) => {
      const anchor = anchorCandidate(index, surface, candidate, cancellation);
      return anchor ? [{ candidate, anchor }] : [];
    });
  const bounded: Array<{ candidate: FieldProofCandidate; anchor: CandidateAnchor; carrier: FieldCarrierPath }> = [];
  let carrierBudgetExhausted = false;
  let carrierAmbiguous = false;
  for (const value of candidates) {
    cancellation.throwIfCancelled();
    const search = searchFieldCarrierPaths(index, origin.elementId, value.candidate.collectionField.id, cancellation);
    if (search.kind === "budget-exhausted") carrierBudgetExhausted = true;
    else if (search.paths.length === 1) bounded.push({ ...value, carrier: search.paths[0] });
    else if (search.paths.length > 1) carrierAmbiguous = true;
  }
  if (carrierBudgetExhausted) {
    augmentSlice(index, cancellation);
    return failedFieldProof(
      origin,
      candidates[0]?.candidate.collectionField ?? index.byId(origin.elementId),
      "source-carrier",
      [],
      "The exact carrier search exhausted its fixed state or depth budget; uniqueness is unavailable.",
      cancellation,
      "budget-exhausted",
    );
  }
  const candidatesByLabel = new Map<string, typeof bounded[number]>();
  for (const value of bounded) {
    const existing = candidatesByLabel.get(value.candidate.consumerLabel);
    if (existing) {
      carrierAmbiguous = true;
      continue;
    }
    candidatesByLabel.set(value.candidate.consumerLabel, value);
  }
  const missingLabels = DIRECT_FIELD_PROOF_TARGETS
    .map((target) => target.consumer.label)
    .filter((label) => !candidatesByLabel.has(label));
  if (missingLabels.length > 0 || carrierAmbiguous) {
    augmentSlice(index, cancellation);
    return failedFieldProof(
      origin,
      candidates[0]?.candidate.collectionField ?? index.byId(origin.elementId),
      "source-carrier",
      [],
      missingLabels.length === DIRECT_FIELD_PROOF_TARGETS.length && !carrierAmbiguous
        ? "The selected filesystem evidence has no unique exact carrier chain to an anchored collection field read."
        : `The selected filesystem evidence is missing or duplicates exact consumer targets: ${missingLabels.join(", ") || "duplicate target"}.`,
      cancellation,
    );
  }
  const proofs: RouteTotalityFieldLineage[] = [];
  for (const { candidate, carrier, anchor } of candidatesByLabel.values()) {
    const assembled = assembleFieldProofTransformations(index, origin, candidate, carrier, cancellation);
    const accepted: RouteTotalityFieldTransformation[] = [];
    for (let step = 0; step < EXACT_FIELD_TRANSFER_KINDS.length; step += 1) {
      const transfer = assembled[step];
      if (!transfer) {
        augmentSlice(index, cancellation);
        return failedFieldProof(origin, accepted.length ? index.byId(accepted.at(-1)!.toElementIds[0]) : index.byId(origin.elementId), EXACT_FIELD_TRANSFER_KINDS[step], accepted, `The exact ${EXACT_FIELD_TRANSFER_KINDS[step]} evidence transfer is missing for ${candidate.consumerLabel}.`, cancellation);
      }
      accepted.push(transfer);
    }
    const policy = deriveExactFieldTargetPolicy(accepted, index.graph());
    if (!policy) {
      augmentSlice(index, cancellation);
      return failedFieldProof(origin, candidate.consumerField, "occurrence-consumer", accepted.slice(0, -1), `The compiler-backed target policy is incomplete or ambiguous for ${candidate.consumerLabel}.`, cancellation);
    }
    for (let step = 0; step < accepted.length; step += 1) {
      const verification = verifyExactFieldTransfer(accepted[step], index.graph(), cancellation, policy);
      if (!verification.ok) {
        augmentSlice(index, cancellation);
        return failedFieldProof(origin, index.byId(accepted[step].fromElementIds[0]), accepted[step].kind as ExactFieldTransferKind, accepted.slice(0, step), verification.detail, cancellation);
      }
    }
    proofs.push(provenFieldProof({
      origin,
      collectionField: candidate.collectionField,
      collectionElement: candidate.collectionElement,
      consumerField: candidate.consumerField,
      occurrence: candidate.occurrence,
      consumerValue: candidate.directConsumer ? candidate.binding : candidate.consumerValue,
      binding: candidate.binding,
      occurrenceId: anchor.occurrenceId,
      terminalId: anchor.terminalId,
      transformations: accepted,
      partial: !slice.coverage.complete || surface.status !== "complete",
      consumerKind: candidate.consumerKind,
      consumerLabel: candidate.consumerLabel,
      directConsumer: candidate.directConsumer,
    }, cancellation));
  }
  augmentSlice(index, cancellation);
  return mergeProvenFieldProofs(proofs, !slice.coverage.complete || surface.status !== "complete", cancellation);
}

type CandidateAnchor = { occurrenceId: string; terminalId: string };

function selectedFilesystemOrigin(
  index: RouteTotalityFieldProofIndex,
  element: NonNullable<ReturnType<RouteTotalityFieldProofIndex["byId"]>>,
  selectedEvidenceId: string,
): RouteTotalityFieldOrigin {
  const key = `${element.id}:filesystem`;
  if (!index.slice.origins.some((origin) => `${origin.elementId}:${origin.role}` === key)) {
    index.slice.origins.push({ elementId: element.id, role: "filesystem", label: element.label, status: element.status, proof: element.proof });
    index.slice.origins.sort((left, right) => `${left.elementId}:${left.role}`.localeCompare(`${right.elementId}:${right.role}`));
  }
  return { elementId: element.id, role: "filesystem", selectedEvidenceId };
}

function anchorCandidate(
  index: RouteTotalityFieldProofIndex,
  surface: FieldProofInput["surface"],
  candidate: FieldProofCandidate,
  cancellation: AnalysisCancellationToken,
): CandidateAnchor | null {
  const anchors = buildRouteTotalityAnchorIndex(index.slice, surface, cancellation);
  if (candidate.directConsumer) {
    const ownerSymbol = candidate.occurrence.symbol?.split("@")[0] ?? null;
    const occurrences = ownerSymbol
      ? surface.occurrences.filter((item) => item.scopeSeed === surface.scope.seed && item.definitionCompilerIdentity === ownerSymbol)
      : [];
    const terminal = anchors.terminalAnchorsByEvidenceElementId.get(candidate.renderTerminal.id) ?? [];
    return occurrences.length === 1 && terminal.length === 1
      ? { occurrenceId: occurrences[0].id, terminalId: terminal[0].endpoint.id }
      : null;
  }
  const occurrence = anchors.occurrenceAnchorsByEvidenceElementId.get(candidate.occurrence.id) ?? [];
  const terminal = anchors.terminalAnchorsByEvidenceElementId.get(candidate.renderTerminal.id) ?? [];
  return occurrence.length === 1 && terminal.length === 1
    ? { occurrenceId: occurrence[0].endpoint.id, terminalId: terminal[0].endpoint.id }
    : null;
}

function augmentSlice(index: RouteTotalityFieldProofIndex, cancellation: AnalysisCancellationToken): void {
  const slice = index.slice;
  const elements = new Map(slice.elements.map((item) => [item.id, item]));
  const relations = new Map(slice.relations.map((item) => [item.id, item]));
  for (const element of index.materializedElements()) elements.set(element.id, element);
  for (const relation of index.materializedRelations()) relations.set(relation.id, relation);
  slice.elements = [...elements.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.relations = [...relations.values()].sort((left, right) => left.id.localeCompare(right.id));
  slice.coverage = coverageFor(slice.elements, slice.relations, slice.origins, slice.terminals, slice.gaps, slice.coverage.truncation, slice.coverage.direction, slice.coverage.budget.limit, slice.coverage.budget.used, slice.coverage.budget.exhausted);
  cancellation.throwIfCancelled();
}
