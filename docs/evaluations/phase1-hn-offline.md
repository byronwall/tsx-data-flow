# Phase 1 Evaluation: HN Offline

## Run

- Repository: `/Users/byronwall/Projects/hn-client` (read-only)
- Command: `node dist/bin/tsx-dataflow.js --root /Users/byronwall/Projects/hn-client --source src --tsconfig tsconfig.json --format json --view findings --max-items 500 --out /tmp/tsx-dataflow-hn-phase1.json`
- Final wall time after selectable-expression support: 2.84 seconds (`user 4.54`, `sys 0.43`)
- Full summary: 159 sources, 186 sinks, 1,561 nodes, 1,396 edges, 5 distinct unknown edges, and 28 path families.
- Interaction observation: CLI analysis met the 1–5 second scoped-analysis expectation. The `HnStoryPage.tsx` file DTO contained 22 selectable traced expressions and serialized to 291,268 bytes.

## Selected trajectory

The selected trajectory is story data from `src/routes/story/[id].tsx` into `HnStoryPage`, then `story()` and the derived `comments()` accessor into comment/story TSX. It matters because it crosses the route/resource, context/store, local accessor, and terminal-render layers named by the phase gate.

Checker-backed evidence distinguished two separate same-named `story` accessors:

- `symbol:4060` — `src/routes/story/[id].tsx:39`, used by the route render at line 46;
- `symbol:3776` — `src/features/comments/HnStoryPage.tsx:37`, with seven project-local uses and terminal reach 29.

It also kept different `id` properties/bindings separate: comment-model `id` at `src/models/interfaces.ts:124`, story-list `id` at line 136, and the route accessor at `src/routes/story/[id].tsx:17` received distinct symbol identities. The rendered `comments()` expression at `HnStoryPage.tsx:83` navigated to its definition at line 59, reported two uses, and showed terminal reach 29.

## Evidence audit

- Proven unnecessary: 2 displayed findings.
- Suspicious transformation: 103 displayed findings.
- Trace incomplete: 12 displayed findings.
- Browsable fact: 23 displayed expressions.
- Top cleanup opportunities were the sticky-comment layout/style expressions in `HnComment.tsx:145–167` (burden approximately 0.51–0.57, reach 8) and the broad `AppDataContext.Provider` value pack at `AppDataContext.tsx:96` (burden 0.44).

False-positive audit: `stackLines().length > 0` initially treated the standard-library `length` declaration under repository-local `node_modules` as project evidence. Phase 1 was corrected so declaration files and `node_modules` are outside the participating identity boundary. The rerun reports no definition, `traceComplete: false`, and `trace-incomplete` evidence.

Missing-path audit: the full trace contained 682 unique selectable expression IDs. On `HnStoryPage.tsx`, `props.story`, `story()`, `story()?.kidsObj`, the fallback, filter, `comments()`, and indexed comment expression received separate spans and evidence. The external `Array.filter` composite remains correctly trace-incomplete while its project-owned inputs remain complete.

## Gate status

Pass. After a hard refresh of the real file page, selecting `story()` at line 59 opened the expression workspace with its definition at line 37, seven usages, `HnItem | undefined` type identity, 29 terminal sinks, two attached findings, six boundaries, a three-step upstream path, and a seven-step downstream path. No browser or hydration errors were recorded.
