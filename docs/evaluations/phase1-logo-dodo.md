# Phase 1 Evaluation: Logo Dodo

## Run

- Repository: `/Users/byronwall/Projects/ai-icon-kit/app` (read-only)
- Command: `node dist/bin/tsx-dataflow.js --root /Users/byronwall/Projects/ai-icon-kit/app --source src --tsconfig tsconfig.json --format json --view findings --max-items 1000 --out /tmp/tsx-dataflow-logo-phase1.json`
- Final wall time after graph-index optimization: 7.90 seconds (`user 12.87`, `sys 0.92`)
- Full summary: 1,631 sources, 2,828 sinks, 18,954 nodes, 16,179 edges, 7 distinct unknown edges, and 42 path families.
- Interaction observation: whole-project analysis stayed below the 10-second target. The findings output was capped at 1,000 rows. The `CandidateGrid.tsx` file DTO contained 102 selectable expressions and serialized to 995,081 bytes.

## Selected trajectory

The selected trajectory is `Candidate.status` and `Candidate.index` from their canonical declarations in `src/lib/logo-workbench/types.ts` through storage/helpers and the workbench components that render candidate controls. This exercises a domain field across considerably more than the required two files.

- `Candidate.status` resolves to `types.ts:203`, reports 31 uses across storage, preview helpers, `CandidateGrid`, `CandidateDetailDialog`, `AllLogosViewer`, `RefinementPanel`, prompting, AI, and route code. Selected terminal expressions show reach 16–27.
- `Candidate.index` resolves to `types.ts:198`, reports 42 uses across candidate boundaries, storage, five workbench/viewer modules, image references, prompting, AI, and routes.
- `Board.imageUrl` resolves to `types.ts:233`, reports 27 uses across storage, workbench components, helpers, admin generations, and the project route; the `ProjectSidebar.tsx:480` render expression shows reach 59.
- `Board.themeName` resolves to `types.ts:227` with uses spanning storage, `ProjectSidebar`, prompting, and the project route.

These fields navigate by canonical property symbol rather than matching the common names `status`, `index`, or `id` globally.

## Evidence audit

Within the 1,000-row output cap:

- Proven unnecessary: 14 displayed findings.
- Suspicious transformation: 874 displayed findings.
- Trace incomplete: 112 displayed findings.
- Top cleanup opportunities included the combined candidate frame/crop style pack in `CandidateGrid.tsx:120` (burden 0.568, reach 27), candidate crop projection in `dashboard.tsx:158` (burden 0.515, reach 10), and the same crop boundary in `ProjectSidebar.tsx:492` (burden 0.507, reach 59).

False-positive audit: common field names were checked against their canonical declarations. Candidate `status` consistently resolved to `types.ts:203`; it did not merge with `Board.status` or unrelated status fields.

Missing-path audit: all traced branches now retain identities rather than only the representative longest path. `CandidateGrid.tsx` independently exposes `props.board`, `props.board.candidates`, `candidate`, candidate fields, preview helpers, and their composite expressions. External method composites remain incomplete while their project-owned receivers/arguments remain complete.

## Gate status

Pass. `Candidate` and `Board` fields navigate across many files without name-based grouping; every participating expression carries type, boundary, graph-node, and terminal identities; and whole-project analysis remains under the 10-second target.
