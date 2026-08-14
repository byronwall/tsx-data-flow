---
title: "Incremental generic field discovery"
status: implemented — next slice proposed
last_updated: 2026-08-13
---

# Incremental generic field discovery

## Status

The original two-slice plan is complete.

The product now has generic field discovery and explicit field focus. The
soccer-specific target list is no longer part of production discovery.

Route Totality polish is in progress. This update assumes that work finishes
with its current acceptance checks passing.

## Completed work

### Field focus

- The selected source exposes its field inventory.
- No selected field means no field-specific green path.
- One selected field shows only its proven consumers and frontiers.
- Clearing the field keeps the source and restores the broad route view.
- URL-restored focus and live selection use the same state.
- Fields with no proven consumer remain available as controls.

Key commits:

- `4f80140` — add one-field route focus.
- `c9778ff` — expose selected route fields.
- `d4f4fec` — narrow route field inspector focus.

### Generic discovery

- Production analysis discovers consumers from compiler evidence.
- Discovery supports the proof grammar that existed before this plan.
- The analyzer preserves exact source, field, occurrence, terminal, and relation
  identity.
- Unsupported transforms remain named frontiers.
- The production analyzer no longer imports `FIELD_PROOF_TARGETS`.
- Soccer G01–G18 remains acceptance data outside production analysis.

Key commits:

- `e2f6171` — add generic discovery and the compact fixture.
- `3f9cf27` — remove the soccer target list.
- `a191d32` — preserve zero-proof controls and strict projections.
- `f2e07c8` — commit the approved guidance and plan.

### Field and graph presentation

- The sidebar uses one progressive column.
- Field rows stay compact until selection.
- Collection rows describe their item fields. They do not appear as failed
  fields.
- Hover and keyboard focus can start selected-source detail loading.
- Completed detail results remain cached for revisits.
- Connected nodes and edges receive selection emphasis.
- Unrelated graph marks recede with their owner.
- Route Totality uses simple curve geometry and the Current workspace visual
  language.
- Click selects. Drag pans. Empty-space click clears.
- Keyboard focus follows the rendered node or edge instead of its SVG box.

Key committed field-control work:

- `1a5d79f` — improve field discovery controls.
- `a752df5` — pack field lists into single rows.

The active Route Totality polish task owns its remaining frontend changes.

## Acceptance evidence

The generic discovery orchestrator reported:

- Soccer proof: 18 attachments and all G01–G18 obligations passed.
- Compact proof: three proven fields and one unsupported-transform frontier.
- Equal-name negative control: no false consumer.
- Soccer browser verification: passed.
- Compact browser verification: passed.
- Keyboard Enter and Space checks: passed.
- `pnpm verify`: 40 files and 254 tests passed.
- Lint: three existing Solid warnings and no errors.
- No hydration, console, or runtime errors.

The compact fixture proves:

| Field | Result |
|---|---|
| `projects[*].name` | Direct render to `PageHeader.title`. |
| `projects[*].id` | Scalar alias to `A.href schedule`. |
| `projects[*].ownerName` | Whole-object prop to `ProjectDetails owner`. |
| `projects[*].code` | Named `unsupported-transform` frontier. |

## Current product contract

1. Source selection chooses the analysis origin.
2. Field selection chooses visible field proof.
3. Green means an exact proven path for the selected field.
4. Amber means a named frontier for the selected field.
5. Neutral topology provides context. It does not imply field proof.
6. Available collection rows are parents for item fields.
7. Equal names do not establish identity.

## Next useful slice — Reduce selected-source latency

### Why this is next

The proof and focus model now work. The reported remaining product cost is the
delay after the user chooses the `readFile` source.

Hover prefetch and response caching improve revisits. They do not reduce the
first selected-source analysis. The next slice should measure and reduce that
cold path before the analyzer adds more grammar or output.

### Outcome

Selecting the soccer `readFile` source shows its field inventory promptly. The
result must keep the same attachments, frontiers, identities, and proof hash.

### Scope

1. Measure the cold selected-source request for the soccer reference route.
2. Record time in evidence collection, candidate discovery, carrier search,
   verification, projection, transfer, and frontend reconciliation.
3. Fix the largest measured cost with one direct change.
4. Reuse the current request cache and prefetch path.
5. Do not add new proof grammar, workers, registries, or cache layers.

Likely files:

- `src/analysis/route-data-session.ts`
- `src/analysis/route-totality-field-proof-query.ts`
- `src/analysis/route-totality-field-proof-index.ts`
- `src/api/projections/route-data.ts`
- `src/frontend/src/overview/DataTrajectoryDialog.tsx`
- existing analyzer instrumentation and acceptance scripts

Change only the files needed by the measured bottleneck.

### Positive check

Use the soccer `readFile` source for `/games/[gameId]`.

The field inventory must still show these proven examples:

- `games[*].opponentName` → `PageHeader.title`.
- `games[*].venueName` → both venue consumers.
- `games[*].status` → the named conditions.
- `games[*].id` → render, condition, and handler consumers.

### Negative and control checks

- An unrelated equal-name consumer remains absent.
- `projects[*].code` remains an unsupported-transform frontier.
- No selected field still produces no field-specific green.
- A cached revisit returns the same semantic result as the cold request.

### Acceptance

- Capture the before and after cold timings on the same machine and commit.
- Reduce the dominant cold-path cost by at least 30 percent.
- Do not increase payload bytes or proof record counts.
- Keep the deterministic proof hash unchanged.
- Keep G01–G18 and the compact fixture green.
- Run lint and typecheck during implementation.
- After approved test work, run the maintained runner and `pnpm verify`.
- Verify the interaction in a fresh browser service.

### Stop point

Stop after one measured optimization passes the checks. Do not combine this
slice with new grammar coverage.

After this slice, choose the next grammar from a real, frequent frontier. Do not
select it from hypothetical examples.

## Deferred work

- New field-transfer grammar.
- Multi-field graph focus.
- Transform visualization changes.
- Overlapping edge-target refinement.

Each item needs direct product evidence before implementation.
