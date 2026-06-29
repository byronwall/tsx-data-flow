import { fanOutEntriesGlobal } from "./overview-selectors.mjs";
import { familyRows } from "../analysis/ranking.mjs";
import { code, fenced, formatMarkdownTable, tableReport, viewIntro } from "./markdown-format.mjs";
import { formatExpression } from "./format-helpers.mjs";

// REPORT-RECONCILE-1: the fan-out report mirrors the web "network view" — for each
// shared source it lists *every* reached sink grouped by file, with each sink's
// depth, plus the source's definition location and a single/cross-file tag. This is
// the markdown the agent consumes, so it carries the same "lists everything, shows
// depth and usage" content as the on-page graph (not the old 5-column summary).
export function renderFanOut(report, args) {
  const entries = fanOutEntriesGlobal(
    report.rankings?.all ?? report.sinks ?? [],
  ).slice(0, args.maxItems);
  const lines = ["# Consumer Fan-Out", "", ...viewIntro("fan-out", report)];
  if (!entries.length) {
    lines.push("_No shared source fans out to ≥2 render sinks._", "");
    return `${lines.join("\n")}\n`;
  }
  for (const entry of entries) {
    const tag =
      entry.fileCount === 1
        ? "single-file (candidate split)"
        : `${entry.fileCount} files (cross-file usage)`;
    lines.push(
      `## ${entry.root} — ${entry.sinkCount} sinks · ${tag} · max depth ${entry.maxDepth}`,
      "",
    );
    if (entry.def) {
      lines.push(`Defined at \`${entry.def.file}:${entry.def.line}\`.`, "");
    }
    const byFile = new Map();
    for (const sink of entry.graphSinks) {
      if (!byFile.has(sink.file)) byFile.set(sink.file, []);
      byFile.get(sink.file).push(sink);
    }
    // MD-1: print the full path once on the file header; sink rows carry only the
    // bare `:line` (+ label/depth). The path is the same for every row in the group,
    // so repeating it is pure token waste — the client resolves the file from the
    // enclosing group header for code previews.
    for (const [file, sinks] of byFile) {
      lines.push(`- **${file}** (${sinks.length})`);
      for (const sink of sinks) {
        const label = sink.label ? ` ${sink.label}` : "";
        lines.push(`  - \`:${sink.line}\`${label} · depth ${sink.depth ?? 0}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function renderFanIn(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(sink.metrics.mergeWidth),
      String(sink.metrics.controlDependencyCount),
      String(sink.metrics.maximumPathDepth),
    ]);
  return tableReport(
    "Sink Fan-In",
    ["Sink", "Root sources", "Predicates", "Max distance"],
    rows,
    viewIntro("fan-in", report),
  );
}

export function renderPathFamilies(report, args) {
  const families = familyRows(report.sinks).slice(0, args.maxItems);
  const rows = families.map((family) => [
    code(family.signature),
    String(family.paths),
    String(family.sinks),
    String(family.maxDepth),
  ]);
  const lines = tableReport(
    "Path Families",
    ["Signature", "Paths", "Sinks", "Max depth"],
    rows,
    viewIntro("path-families", report),
  ).split("\n");

  // MD-7: the table only counts; show a representative example per family — the
  // deepest member's path — so the recurring shape is concrete and a single shared
  // fix can be reasoned about. Biggest/gnarliest families first.
  const withExamples = families
    .filter((family) => family.example)
    .sort((a, b) => b.sinks * b.maxDepth - a.sinks * a.maxDepth);
  if (withExamples.length) {
    lines.push("## Representative examples", "");
    for (const family of withExamples) {
      const sink = family.example;
      lines.push(
        `### ${code(family.signature)} — ${plural(family.sinks, "sink")}, max depth ${family.maxDepth}`,
        "",
        `Deepest member: \`${sink.file}:${sink.line}\``,
        "",
        ...fenced(representativePathLines(sink)),
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderDefensiveLedger(report, args) {
  // One defense can reach many sinks (e.g. a `size` fallback that drives several
  // JSX outputs), so the same guard would otherwise repeat once per reachable
  // sink. Dedupe by location+expression and surface the fan-out as a count so
  // the breadth is preserved without wasting rows on identical entries.
  const byKey = new Map();
  for (const sink of report.sinks) {
    for (const defense of sink.defenses) {
      const key = `${sink.file}:${defense.location.line}|${defense.expression}`;
      const existing = byKey.get(key);
      if (existing) existing.count += 1;
      else byKey.set(key, { sink, defense, count: 1 });
    }
  }
  // Impossible verdicts (dead guards) matter most; rank them first so a small
  // --max-items cap surfaces the worst, not whatever was encountered first.
  // Tie-break on fan-out (count) so a guard that reaches many sinks wins.
  const verdictRank = { impossible: 0, possible: 1, unknown: 2 };
  const rows = [...byKey.values()]
    .sort((a, b) => {
      const va = verdictRank[a.defense.verdict] ?? 3;
      const vb = verdictRank[b.defense.verdict] ?? 3;
      if (va !== vb) return va - vb;
      return b.count - a.count;
    })
    .slice(0, args.maxItems)
    .map(({ sink, defense, count }) => [
      `${sink.file}:${defense.location.line}`,
      code(formatExpression(defense.expression)),
      code(defense.type),
      String(count),
      defense.verdict,
      defense.origin ?? "—",
      defensiveActionFor(defense),
    ]);
  return tableReport(
    "Defensive Logic",
    ["Location", "Expression", "Type", "Sinks", "Verdict", "Origin", "Action"],
    rows,
    viewIntro("defensive-ledger", report),
  );
}

function defensiveActionFor(defense) {
  if (defense.verdict === "impossible") return "remove after contract check";
  if (/solid prop default/i.test(defense.origin ?? "")) {
    return "promote to mergeProps default";
  }
  if (/api-choice/i.test(defense.origin ?? "")) {
    return "keep caller-precedence fallback";
  }
  if (/parser-boundary|compatibility|optional/i.test(defense.origin ?? "")) {
    return "keep as certainty boundary";
  }
  if (defense.verdict === "unknown") return "inspect runtime shape";
  return "review boundary placement";
}

export function renderPropRelay(report, args) {
  const rows = report.rankings.all
    .slice(0, args.maxItems)
    .map((sink) => [
      `${sink.file}:${sink.line}`,
      String(Math.max(0, sink.metrics.mergeWidth - 1)),
      String(sink.metrics.representationChurn),
      sink.metrics.helperHops === 0 ? "pure data relay" : "transformed relay",
    ]);
  return tableReport(
    "Prop Relay",
    ["Sink", "Component boundaries", "Wrapper steps", "Classification"],
    rows,
    viewIntro("prop-relay", report),
  );
}

export function renderContextRelay(report, args) {
  const findings = report.contextRelay.slice(0, args.maxItems);
  const rows = findings.map((finding) => [
    `${finding.parentFile}:${finding.line}`,
    finding.childComponent,
    finding.contextHooks.join(", "),
    finding.props.join(", "),
    finding.signal,
  ]);
  const lines = tableReport(
    "Context Relay",
    ["Parent", "Child", "Context hooks in parent", "Passed props", "Signal"],
    rows,
    viewIntro("context-relay", report),
  ).split("\n");

  // MD-6: the table summarizes; the evidence below shows *why* each example reads as
  // a relay so an agent can act without re-deriving it — the parent already holds the
  // context, and the props it forwards (especially the shared-named ones) duplicate
  // values the child could read from context directly.
  if (findings.length) {
    lines.push("## Why these are relays", "");
    for (const finding of findings) {
      lines.push(
        `### ${finding.childComponent} — \`${finding.parentFile}:${finding.line}\``,
        "",
        `- Parent reads context via ${finding.contextHooks.map((hook) => code(hook)).join(", ") || "_(context hooks in scope)_"}.`,
        `- It forwards ${plural(finding.props.length, "prop")} to \`${finding.childComponent}\`: ${finding.props.map((prop) => code(prop)).join(", ")}.`,
      );
      if (finding.sharedProps?.length) {
        lines.push(
          `- ${plural(finding.sharedProps.length, "prop")} reuse a context-shaped name — ${finding.sharedProps
            .map((prop) => code(prop))
            .join(
              ", ",
            )} — so the child could read ${finding.sharedProps.length === 1 ? "it" : "them"} from context instead of receiving ${finding.sharedProps.length === 1 ? "it" : "them"} as ${finding.sharedProps.length === 1 ? "a prop" : "props"}.`,
        );
      } else {
        lines.push(
          `- Signal: ${finding.signal} — the whole bundle is forwarded from a context-aware parent.`,
        );
      }
      lines.push(
        `- Open \`${finding.parentFile}:${finding.line}\` to see the hand-off.`,
        "",
      );
    }
  }
  return `${lines.join("\n")}\n`;
}


function representativePathLines(sink, { showKind = true } = {}) {
  const steps =
    sink.representativeSteps ??
    sink.representativePath.map((label) => ({ label, kind: null }));
  if (steps.length === 0) return ["(no path)"];
  return steps.map((step) => {
    const label = formatExpression(step.label);
    return showKind && step.kind
      ? "-> " + label + "  [" + step.kind + "]"
      : "-> " + label;
  });
}

function plural(count, noun) {
  return count + " " + noun + (count === 1 ? "" : "s");
}
