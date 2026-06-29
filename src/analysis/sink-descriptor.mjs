export function reachedSinkDescriptor(sink) {
  const ctx = sink.renderContext ?? {};
  const where = [ctx.tag, ctx.attribute].filter(Boolean).join(" / ");
  return {
    id: sink.id,
    file: sink.file,
    line: sink.line,
    label: where || sink.label || sink.expression || sink.id,
    depth: sink.metrics?.maximumPathDepth ?? 0,
  };
}
