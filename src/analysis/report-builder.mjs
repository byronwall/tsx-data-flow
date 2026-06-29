import { countDistinctUnknownEdges, createGraph } from "./graph.mjs";
import { compareBaseline } from "./baseline-compare.mjs";
import { buildComponentRefs } from "./component-refs.mjs";
import { familyRows, rankSinks } from "./ranking.mjs";
import { buildUnknownEdgeRows } from "./unknown-edges.mjs";
import { shouldAnalyzeFile } from "../project/files.mjs";

export function buildReport(
  ts,
  program,
  args,
  typescriptModulePath = null,
  routing = null,
  dependencies,
) {
  const {
    analyzeSourceFile,
    analyzeContextRelay,
    buildHelperReport,
    computeConcentration,
    computePackGroups,
    computeWorkUnits,
    groundReachability,
    applyPackEvidence,
    unique,
  } = dependencies;
  const checker = program.getTypeChecker();
  const graph = createGraph(args.root);
  const sourceFiles = program
    .getSourceFiles()
    .filter((sourceFile) => !sourceFile.isDeclarationFile)
    .filter((sourceFile) => shouldAnalyzeFile(sourceFile.fileName, args));
  const sinks = [];

  // Shared cross-file state: a static catalog of first-party functions, a
  // per-file context cache, and the set of functions actually reached while
  // tracing render paths. Built before tracing so descent can consult it.
  const crossFile = {
    args,
    contextCache: new Map(),
    catalog: new Map(),
    reached: new Set(),
    // Hard safety cap on total cross-file descents per report, so a pathological
    // call graph can't run the graph out of memory regardless of depth.
    budget: 20000,
  };

  const forks = [];
  // Trace each file exactly once. When a file is owned by an aliased config (see
  // buildProgramRouting), use that config's program/checker so its path-alias
  // imports resolve; otherwise use the primary program. Nodes and the checker
  // that resolves them must come from the same program, so owned files are traced
  // from their owner program's SourceFile objects.
  const traced = new Set();
  const traceFile = (sourceFile, useChecker) => {
    if (sourceFile.isDeclarationFile) return;
    if (!shouldAnalyzeFile(sourceFile.fileName, args)) return;
    if (traced.has(sourceFile.fileName)) return;
    traced.add(sourceFile.fileName);
    const analysis = analyzeSourceFile(
      ts,
      useChecker,
      graph,
      sourceFile,
      args,
      crossFile,
    );
    sinks.push(...analysis.sinks);
    forks.push(...analysis.forks);
  };
  if (routing) {
    for (const ownerProgram of routing.programs) {
      for (const sourceFile of ownerProgram.getSourceFiles()) {
        const owned = routing.byFile.get(sourceFile.fileName);
        if (owned && owned.program === ownerProgram) {
          traceFile(sourceFile, owned.checker);
        }
      }
    }
  }
  for (const sourceFile of sourceFiles) {
    traceFile(sourceFile, checker);
  }

  const fileMatch = makeFileMatcher(args.file);
  const scopedSinks = applyScope(sinks, args.scope);
  const filteredSinks = fileMatch
    ? scopedSinks.filter((sink) => fileMatch(sink.file))
    : scopedSinks;
  groundReachability(filteredSinks);
  const scopedRelay = applyContextRelayScope(
    analyzeContextRelay(ts, sourceFiles, args.root),
    args.scope,
  );
  const contextRelay = fileMatch
    ? scopedRelay.filter(
        (finding) =>
          fileMatch(finding.parentFile) || fileMatch(finding.childFile),
      )
    : scopedRelay;
  const packGroups = computePackGroups(filteredSinks);
  applyPackEvidence(filteredSinks, packGroups);
  const rankings = rankSinks(
    filteredSinks.filter(
      (sink) => sink.category !== "event-handler" && !isConstantSink(sink),
    ),
  );
  // Shared-cause work units (Approach 3) and the concentration profile
  // (Approach 5) are pure roll-ups over the burden ranking; compute once so
  // every view projects from the same data.
  const workUnits = computeWorkUnits(rankings.all);
  const concentration = computeConcentration(rankings.all);
  const allHelpers = buildHelperReport(
    ts,
    checker,
    crossFile,
    args,
    sourceFiles,
  );
  const helpers = fileMatch
    ? allHelpers.filter((helper) => fileMatch(helper.file))
    : allHelpers;
  const unknownEdges = buildUnknownEdgeRows(graph, filteredSinks);
  const allComponentRefs = buildComponentRefs(
    ts,
    checker,
    sourceFiles,
    args.root,
  );
  const componentRefs = fileMatch
    ? allComponentRefs.filter(
        (ref) => fileMatch(ref.file) || ref.uses.some((u) => fileMatch(u.file)),
      )
    : allComponentRefs;
  const repeatedForks = relateForks(
    fileMatch ? forks.filter((fork) => fileMatch(fork.file)) : forks,
    filteredSinks,
  ).sort((left, right) => right.severity - left.severity);
  const baseline = args.baseline
    ? compareBaseline(rankings, args.baseline)
    : null;

  return {
    analysisVersion: 1,
    generatedAt: new Date().toISOString(),
    meta: {
      root: args.root,
      source: args.source,
      tsconfig: args.tsconfig ?? null,
      tsconfigs: args.tsconfigs ?? (args.tsconfig ? [args.tsconfig] : []),
      tsconfigWarnings: args.tsconfigWarnings ?? [],
      typescript: typescriptModulePath,
      scope: args.scope,
      file: args.file.length ? args.file : null,
    },
    graph: {
      nodes: graph.nodes,
      edges: graph.edges,
      unknownEdges: countDistinctUnknownEdges(graph),
    },
    sinks: filteredSinks,
    contextRelay,
    rankings,
    packGroups,
    workUnits,
    concentration,
    helpers,
    unknownEdges,
    componentRefs,
    repeatedForks,
    baseline,
    summary: summarize(filteredSinks, graph, { familyRows, unique }),
  };
}

// Attach the per-sink findings rendered under each fork's discriminated
// branches. Sinks whose line falls inside a branch body are "branch-gated" - the
// ones a split would actually move; the rest are component context. This avoids
// the misleading "splitting on X touches all N sinks in the component" claim.
function relateForks(forks, sinks) {
  return forks.map((fork) => {
    const inComponent = sinks
      .filter(
        (sink) =>
          sink.file === fork.file &&
          sink.renderContext?.component === fork.component,
      )
      .sort(
        (left, right) =>
          (right.scores?.burden ?? 0) - (left.scores?.burden ?? 0),
      );
    const ranges = fork.branchRanges ?? [];
    const inBranch = (sink) =>
      ranges.some(
        (range) => sink.line >= range.startLine && sink.line <= range.endLine,
      );
    const toRef = (sink) => ({
      id: sink.id,
      line: sink.line,
      label: sink.label,
    });
    return {
      ...fork,
      relatedSinks: inComponent.map(toRef),
      branchGatedSinks: inComponent.filter(inBranch).map(toRef),
    };
  });
}

function applyScope(sinks, scope) {
  if (!scope) return sinks;
  return sinks.filter(
    (sink) =>
      sink.file.includes(scope) ||
      sink.label.includes(scope) ||
      sink.roots.some((root) => root.includes(scope)),
  );
}

// Translate one `--file` pattern into a RegExp matched against a relative file
// path. Unlike `--scope` (a fuzzy substring over file/label/symbol), this is
// path-only and glob-aware so an agent can pin a report to exactly one file,
// directory, or glob region:
//   src/components/Button.tsx   exact file
//   Button.tsx                  any path ending in /Button.tsx
//   src/components              a directory (everything under it)
//   src/components/**           same, explicit glob
//   src/**/*.tsx                all .tsx anywhere under src
// Globs: `*` matches within a path segment, `**` across segments, `?` one char.
function fileFilterToRegExp(pattern) {
  let p = pattern.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  const hasGlob = /[*?]/.test(p);
  // A bare directory-ish pattern (no glob, no extension on the final segment)
  // is treated as a prefix so `--file src/components` digs into the whole dir.
  const lastSegment = p.split("/").pop() ?? "";
  if (!hasGlob && !lastSegment.includes(".")) {
    p = p.replace(/\/+$/, "") + "/**";
  } else if (p.endsWith("/")) {
    p += "**";
  }

  let body = "";
  for (let index = 0; index < p.length; index += 1) {
    const char = p[index];
    if (char === "*") {
      if (p[index + 1] === "*") {
        body += ".*";
        index += 1;
        if (p[index + 1] === "/") index += 1; // let `a/**/b` match `a/b`
      } else {
        body += "[^/]*";
      }
    } else if (char === "?") {
      body += "[^/]";
    } else {
      body += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  // Anchor to the path end and to a segment boundary at the front, so a bare
  // `Button.tsx` matches `src/ui/Button.tsx` but not `MyButton.tsx`.
  return new RegExp(`(^|/)${body}$`);
}

// Build a predicate over relative file paths from zero or more `--file`
// patterns (OR within the set). Returns null when no patterns were given.
export function makeFileMatcher(patterns) {
  if (!patterns || patterns.length === 0) return null;
  const regexps = patterns.map(fileFilterToRegExp);
  return (file) => regexps.some((regexp) => regexp.test(file));
}

function summarize(sinks, graph, { familyRows, unique }) {
  return {
    sources: unique(sinks.flatMap((sink) => sink.roots)).length,
    sinks: sinks.length,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    unknownEdges: countDistinctUnknownEdges(graph),
    pathFamilies: familyRows(sinks).length,
  };
}

// A sink whose value is a pure constant (e.g. `stroke-dashoffset={0}`,
// `width={32}`): every contributing root is a literal and there is no
// transformation, guard, or control-flow burden. There is nothing to refactor,
// so it should never surface as a ranked finding.
function isConstantSink(sink) {
  const infos =
    sink.rootInfos ??
    sink.roots.map((root) => ({ label: root, kind: "source" }));
  if (infos.length === 0) return false;
  if (!infos.every((info) => info.kind === "literal")) return false;
  const metrics = sink.metrics ?? {};
  return (
    (metrics.maximumPathDepth ?? 0) <= 1 &&
    (sink.defenses?.length ?? 0) === 0 &&
    (metrics.representationChurn ?? 0) === 0 &&
    (metrics.controlDependencyCount ?? 0) === 0 &&
    (metrics.unknownEdgeCount ?? 0) === 0
  );
}

function applyContextRelayScope(findings, scope) {
  if (!scope) return findings;
  return findings.filter(
    (finding) =>
      finding.parentFile.includes(scope) ||
      finding.childFile.includes(scope) ||
      finding.childComponent.includes(scope) ||
      finding.props.some((prop) => prop.includes(scope)),
  );
}
