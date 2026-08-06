import type { RouteTotality } from "../../../api/contracts";
import type {
  RouteTotalityLayout,
  RouteTotalityLayoutNode,
  RouteTotalitySelection,
} from "./route-totality-model";

type FindingAttachment = RouteTotality["findingAttachments"][number];
type FindingIndexEntry = RouteTotality["findingIndex"][number];

export type RouteTotalityFindingTargetDetail = {
  kind: FindingAttachment["target"]["kind"];
  role: string | null;
  status: FindingAttachment["status"];
};

export type RouteTotalityFindingMatch = {
  entry: FindingIndexEntry;
  statuses: readonly FindingAttachment["status"][];
  targetDetails: readonly RouteTotalityFindingTargetDetail[];
};

export type RouteTotalityFindingSummary = {
  count: number;
  matches: readonly RouteTotalityFindingMatch[];
};

const EMPTY_SUMMARY: RouteTotalityFindingSummary = Object.freeze({
  count: 0,
  matches: Object.freeze([]),
});

export function routeTotalityFindingSummaryForSelection(
  totality: RouteTotality | null,
  layout: RouteTotalityLayout,
  selection: RouteTotalitySelection,
): RouteTotalityFindingSummary {
  if (!totality || !selection || selection.kind !== "node") return EMPTY_SUMMARY;
  const node = (layout.nodes as RouteTotalityLayoutNode[]).find((candidate) => candidate.id === selection.id);
  return node ? routeTotalityFindingSummaryForNode(totality, node) : EMPTY_SUMMARY;
}

export function routeTotalityFindingSummaryForNode(
  totality: RouteTotality | null,
  node: RouteTotalityLayoutNode,
): RouteTotalityFindingSummary {
  if (!totality) return EMPTY_SUMMARY;
  const indexByFindingId = new Map(totality.findingIndex.map((entry) => [entry.findingId, entry]));
  const grouped = new Map<string, {
    statuses: FindingAttachment["status"][];
    targetDetails: RouteTotalityFindingTargetDetail[];
  }>();
  for (const attachment of totality.findingAttachments) {
    const targetDetail = findingTargetDetailForNode(attachment, node);
    if (!targetDetail) continue;
    const group = grouped.get(attachment.findingId) ?? { statuses: [], targetDetails: [] };
    if (!group.statuses.includes(attachment.status)) group.statuses.push(attachment.status);
    if (!group.targetDetails.some((detail) => sameTargetDetail(detail, targetDetail))) group.targetDetails.push(targetDetail);
    grouped.set(attachment.findingId, group);
  }
  const matches = [...grouped.entries()]
    .flatMap(([findingId, group]) => {
      const entry = indexByFindingId.get(findingId);
      return entry ? [{
        entry,
        statuses: Object.freeze([...group.statuses]),
        targetDetails: Object.freeze([...group.targetDetails].sort(compareTargetDetails)),
      }] : [];
    })
    .sort((left, right) => left.entry.findingId.localeCompare(right.entry.findingId));
  return matches.length ? { count: matches.length, matches: Object.freeze(matches) } : EMPTY_SUMMARY;
}

function findingTargetDetailForNode(
  attachment: FindingAttachment,
  node: RouteTotalityLayoutNode,
): RouteTotalityFindingTargetDetail | null {
  const target = attachment.target;
  if (node.kind === "evidence-element" && "id" in node.record) {
    if (target.source !== "evidence-slice" || target.id !== node.record.id) return null;
    if (target.kind === "element") return targetDetail(target.kind, target.role, attachment.status);
    if (target.kind === "terminal" && "terminalRoles" in node.record && node.record.terminalRoles.includes(target.role)) {
      return targetDetail(target.kind, target.role, attachment.status);
    }
    return null;
  }
  if (node.kind === "origin" && "role" in node.record) {
    return target.source === "evidence-slice"
      && target.kind === "origin"
      && target.id === node.record.elementId
      && target.role === node.record.role
      ? targetDetail(target.kind, target.role, attachment.status)
      : null;
  }
  if (node.kind === "terminal") {
    return target.kind === "terminal"
      && target.source === node.source
      && "id" in node.record
      && target.id === node.record.id
      && target.role === null
      ? targetDetail(target.kind, target.role, attachment.status)
      : null;
  }
  return null;
}

function targetDetail(
  kind: FindingAttachment["target"]["kind"],
  role: string | null,
  status: FindingAttachment["status"],
): RouteTotalityFindingTargetDetail {
  return { kind, role, status };
}

function sameTargetDetail(left: RouteTotalityFindingTargetDetail, right: RouteTotalityFindingTargetDetail): boolean {
  return left.kind === right.kind && left.role === right.role && left.status === right.status;
}

function compareTargetDetails(left: RouteTotalityFindingTargetDetail, right: RouteTotalityFindingTargetDetail): number {
  return `${left.kind}:${left.role ?? ""}:${left.status}`.localeCompare(`${right.kind}:${right.role ?? ""}:${right.status}`);
}
