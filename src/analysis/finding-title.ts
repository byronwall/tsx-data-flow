export function findingTitle(sink) {
  if (sink.metrics.impossibleDefenseCount > 0) {
    return "type-impossible defensive render path";
  }
  if (sink.metrics.representationChurn > 1) {
    return "representation-heavy render path";
  }
  if (sink.metrics.helperHops > 1) return "helper-heavy render path";
  return "render-path data-flow hotspot";
}
