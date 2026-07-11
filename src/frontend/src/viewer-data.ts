import type { ReachedSink, Sink } from "../../types";
import { fanOutIdentity, fanOutRootsFor } from "../../analysis/fan-out";

export interface FanOutEntry {
  root: string;
  kind?: string;
  def?: { file: string; line: number } | null;
  sinkCount: number;
  fileCount: number;
  line: number | null;
  maxDepth: number;
  sinks: ReachedSink[];
  graphSinks: ReachedSink[];
}

export function fanInEntries(sinks: Sink[]) {
  return sinks
    .map((sink: Sink) => {
      const roots = sourceLabelsForSink(sink);
      return {
        key: `fanin-${sink.id}`,
        label: sinkLabel(sink),
        file: sink.file ?? "",
        line: sink.line ?? 0,
        roots,
        rootCount: sink.metrics?.mergeWidth ?? roots.length,
        predicates: sink.metrics?.controlDependencyCount ?? 0,
        depth: sink.metrics?.maximumPathDepth ?? 0,
      };
    })
    .filter((entry) => entry.rootCount >= 2 || entry.roots.length >= 2)
    .sort(
      (left, right) =>
        right.rootCount - left.rootCount || right.depth - left.depth,
    );
}

export function propRelayEntries(sinks: Sink[]) {
  return sinks
    .map((sink: Sink) => {
      const roots = sourceLabelsForSink(sink);
      const wrapperSteps = sink.metrics?.representationChurn ?? 0;
      const boundaries = Math.max(0, (sink.metrics?.mergeWidth ?? 1) - 1);
      const helperHops = sink.metrics?.helperHops ?? 0;
      return {
        key: `relay-${sink.id}`,
        label: sinkLabel(sink),
        file: sink.file ?? "",
        line: sink.line ?? 0,
        roots,
        wrapperSteps,
        boundaries,
        helperHops,
        depth: sink.metrics?.maximumPathDepth ?? 0,
      };
    })
    .filter(
      (entry) =>
        entry.wrapperSteps > 0 || entry.boundaries > 0 || entry.helperHops > 0,
    )
    .sort(
      (left, right) =>
        right.boundaries - left.boundaries ||
        right.wrapperSteps - left.wrapperSteps ||
        right.depth - left.depth,
    );
}

export function sourceLabelsForSink(sink: Sink): string[] {
  const labels: string[] = fanOutRootsFor(sink).map((info) => String(info.label));
  if (!labels.length) labels.push(...(sink.roots ?? []));
  return [...new Set(labels)].slice(0, 12);
}

export function sinkLabel(sink: Sink): string {
  const ctx = sink.renderContext ?? {};
  const rendered = [ctx.component ?? ctx.tag, ctx.attribute]
    .filter(Boolean)
    .join(" / ");
  const label =
    rendered || sink.label || sink.expression || sink.target || sink.id;
  return `${sink.file ? `:${sink.line} ` : ""}${label}`;
}

export function relationshipGraphSvg(options: {
  ariaLabel: string;
  leftTitle: string;
  left: string[];
  middleLabel: string;
  middleSub: string;
  middleHref: string | null;
  rightTitle: string;
  right: Array<{ label: string; file?: string; line?: number }>;
}): string {
  const left = options.left.length ? options.left : ["(no traced inputs)"];
  const right = options.right.length
    ? options.right
    : [{ label: "(no resolved sinks)" }];
  const nodeH = 24;
  const gap = 10;
  const colW = 210;
  const midW = 190;
  const midGap = 56;
  const midX = colW + midGap;
  const rightX = midX + midW + midGap;
  const width = rightX + colW;
  const rows = Math.max(left.length, right.length, 1);
  const height = Math.max(124, 48 + rows * (nodeH + gap));
  const midCy = height / 2;
  const cyOf = (index: number, count: number) => {
    const blockH = Math.max(0, count * (nodeH + gap) - gap);
    return (height - blockH) / 2 + index * (nodeH + gap) + nodeH / 2;
  };
  const sourceHsl = "262 60% 52%";
  const sinkHsl = "150 55% 40%";
  const edges: string[] = [];
  const nodes: string[] = [];
  nodes.push(
    `<text x="0" y="16" font-size="11" font-weight="600" fill="var(--muted)">${escapeHtml(options.leftTitle)}</text>`,
    `<text x="${rightX}" y="16" font-size="11" font-weight="600" fill="var(--muted)">${escapeHtml(options.rightTitle)}</text>`,
  );
  left.forEach((label: string, index: number) => {
    const cy = cyOf(index, left.length);
    nodes.push(
      `<g class="fg-node"><rect class="fg-hit" x="0" y="${cy - nodeH / 2}" width="${colW}" height="${nodeH}" rx="6" fill="hsl(${sourceHsl} / 0.08)" stroke="hsl(${sourceHsl} / 0.5)"/><text x="12" y="${cy + 4}" font-size="11" fill="currentColor">${escapeHtml(truncText(label, 30))}</text></g>`,
    );
    edges.push(
      `<path d="M${colW} ${cy} C ${colW + 30} ${cy}, ${midX - 30} ${midCy}, ${midX} ${midCy}" fill="none" stroke="hsl(${sourceHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  right.forEach((item, index: number) => {
    const cy = cyOf(index, right.length);
    const content = `<g class="fg-node"><rect class="fg-hit" x="${rightX}" y="${cy - nodeH / 2}" width="${colW}" height="${nodeH}" rx="6" fill="hsl(${sinkHsl} / 0.08)" stroke="hsl(${sinkHsl} / 0.5)"/><text x="${rightX + 12}" y="${cy + 4}" font-size="11" fill="currentColor">${escapeHtml(truncText(item.label, 30))}</text></g>`;
    nodes.push(
      item.file && item.line
        ? `<a class="xfile" href="/file?path=${encodeURIComponent(item.file)}#L${item.line}">${content}</a>`
        : content,
    );
    edges.push(
      `<path d="M${midX + midW} ${midCy} C ${midX + midW + 30} ${midCy}, ${rightX - 30} ${cy}, ${rightX} ${cy}" fill="none" stroke="hsl(${sinkHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  const midNode = `<g class="fg-src"><rect x="${midX}" y="${midCy - 18}" width="${midW}" height="36" rx="8" fill="hsl(205 70% 50% / 0.16)" stroke="hsl(205 70% 50%)" stroke-width="2"/>
    <text x="${midX + 12}" y="${midCy - 2}" font-size="11.5" font-weight="600" fill="currentColor">${escapeHtml(truncText(options.middleLabel, 24))}</text>
    <text x="${midX + 12}" y="${midCy + 13}" font-size="10" fill="var(--muted)">${escapeHtml(options.middleSub)}</text></g>`;
  const middle = options.middleHref
    ? `<a class="xfile" href="${escapeAttr(options.middleHref)}">${midNode}</a>`
    : midNode;
  return `<div class="fanout-graph">
  <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="${escapeAttr(options.ariaLabel)}">
    ${edges.join("")}
    ${nodes.join("")}
    ${middle}
  </svg>
  <div class="fg-legend"><span class="fg-key"><span class="fg-swatch" style="background:hsl(${sourceHsl})"></span>${escapeHtml(options.leftTitle)}</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(205 70% 50%)"></span>selected node</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(${sinkHsl})"></span>${escapeHtml(options.rightTitle)}</span></div>
</div>`;
}

export function truncText(value: unknown, max: number): string {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function sortFanOutEntries(
  entries: FanOutEntry[],
  sortKey: string,
): FanOutEntry[] {
  return [...entries].sort((left, right) => {
    if (sortKey === "name") return left.root.localeCompare(right.root);
    if (sortKey === "depth") return right.maxDepth - left.maxDepth;
    if (sortKey === "files") return right.fileCount - left.fileCount;
    return right.sinkCount - left.sinkCount || right.maxDepth - left.maxDepth;
  });
}

export function fanOutEntriesGlobal(sinks: Sink[]): FanOutEntry[] {
  return fanOutEntries(sinks, null);
}

export function fanOutEntriesForFile(sinks: Sink[], relPath: string): FanOutEntry[] {
  return fanOutEntries(sinks, relPath).filter(
    (entry) => entry.sinks.length > 0,
  );
}

function fanOutEntries(sinks: Sink[], relPath: string | null): FanOutEntry[] {
  const entries = new Map<
    string,
    {
      root: string;
      kind?: string;
      def?: { file: string; line: number } | null;
      total: number;
      files: Set<string>;
      inFile: ReachedSink[];
      graphSinks: ReachedSink[];
      maxDepth: number;
      example: Sink | null;
    }
  >();
  for (const sink of sinks) {
    for (const info of fanOutRootsFor(sink)) {
      const { key, label } = fanOutIdentity(sink, info);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          root: label,
          kind: info.kind,
          def: info.def ?? null,
          total: 0,
          files: new Set(),
          inFile: [],
          graphSinks: [],
          maxDepth: 0,
          example: null,
        };
        entries.set(key, entry);
      }
      entry.total += 1;
      if (sink.file) entry.files.add(sink.file);
      const reached = reachedSinkDescriptor(sink);
      entry.graphSinks.push(reached);
      entry.maxDepth = Math.max(
        entry.maxDepth,
        sink.metrics?.maximumPathDepth ?? 0,
      );
      if (relPath == null || sink.file === relPath) {
        entry.inFile.push(reached);
        if (
          !entry.example ||
          (sink.metrics?.maximumPathDepth ?? 0) >
            (entry.example.metrics?.maximumPathDepth ?? 0)
        ) {
          entry.example = sink;
        }
      }
    }
  }
  return [...entries.values()]
    .filter((entry) => entry.total >= 2)
    .map((entry) => ({
      root: entry.root,
      kind: entry.kind,
      def: entry.def,
      sinkCount: entry.total,
      fileCount: entry.files.size,
      line: entry.example?.line ?? entry.inFile[0]?.line ?? null,
      maxDepth: entry.maxDepth,
      sinks: entry.inFile,
      graphSinks: entry.graphSinks,
    }))
    .sort((left, right) => right.sinkCount - left.sinkCount);
}

function reachedSinkDescriptor(sink: Sink): ReachedSink {
  const ctx = sink.renderContext ?? {};
  const label = [ctx.tag, ctx.attribute].filter(Boolean).join(" / ");
  return {
    id: sink.id,
    file: sink.file,
    line: sink.line,
    label: label || sink.label || sink.expression || sink.id,
    depth: sink.metrics?.maximumPathDepth ?? 0,
  };
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttr(value: unknown): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

