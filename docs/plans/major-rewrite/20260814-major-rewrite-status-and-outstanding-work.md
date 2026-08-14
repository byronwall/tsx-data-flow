---
title: "Major rewrite status and outstanding work"
status: authoritative
last_updated: 2026-08-14
repository_commit: 8cd3734
---

# Major rewrite status and outstanding work

## Purpose

This document is the current status record for the major rewrite.

Use older plans for intent and implementation history. Do not use their status
labels to select new work.

## Current result

The route-analysis foundation is complete for its approved scope.

The product now provides:

- one shared evidence and slice model;
- exact component occurrence identity;
- Route Totality with honest gaps and coverage;
- source, terminal, context, finding, and code investigation;
- URL-restored route investigation state;
- selected-source field inventory and one-field focus;
- exact field proof for the supported collection pattern;
- generic candidate discovery without soccer targets in production policy;
- explicit field frontiers;
- a maintained field-proof acceptance runner; and
- measured selected-source latency improvements.

The current soccer acceptance case has 18 exact attachments across six item
fields. It covers render, condition, handler, whole-object, and scalar-alias
consumers.

## Reconciled project status

| Project | Current status | Evidence or boundary |
|---|---|---|
| 1 — First proven route slice | Complete | The exact source-to-terminal slice and occurrence identity shipped. |
| 2 — Scope-neutral proof pack | Complete for the fixture pack | Route, full-stack, CLI, HTTP, and serverless fixtures use one evidence vocabulary. Large-repository scale remains a separate risk. |
| 3 — Honest route totality | Complete | The route surface, gaps, coverage, projection, and comprehension gates passed. |
| 4 — Route investigation workspace | Complete for the current product contract | Source selection, path focus, code, findings, context, and restored URL state exist. The old production-build gate is retired by current repository rules. |
| 5 — Route cutover and legacy removal | Partial | Route Totality is not the only renderer. Current-workspace and legacy analysis support remain. |
| 6 — Type and field flow | Partial | Exact selected-source field proof exists for one bounded grammar. General type and transformation flow does not exist. |
| 7 — Finding impact | Partial | Exact finding marks and inspector details exist. Shared-cause grouping, blast radius, and reanalysis remain candidates. |
| 8 — Read, write, and reconcile | Not started | Handler consumers exist, but no complete write and reconciliation lifecycle exists. |
| 9 — Application atlas | Partial | A route atlas exists. A cross-scope repository atlas does not exist. |
| 10 — Agent handoff and hardening | Partial foundation | Work-packet reports and route packets exist. A selected evidence-backed investigation packet and semantic reanalysis do not exist. |

Projects 6 through 10 remain candidates. Their incomplete milestones are not
automatic commitments.

## Reconciled field-flow priorities

The final field-flow retrospective listed eight priorities. Their current
status is:

| Priority | Status | Current evidence |
|---|---|---|
| 1. Close the repository evidence gap | Complete | Approved regression coverage and a recorded `pnpm verify` pass exist. |
| 2. Create one maintained acceptance runner | Complete | `pnpm accept:route-field-proof` checks named obligations and rejects zero proof. |
| 3. Separate discovery from acceptance | Complete | Production discovery is generic. G01–G18 stay in the obligation file. |
| 4. Return proven subsets with frontiers | Complete | Exact attachments and named frontiers can coexist. |
| 5. Measure and bound performance | Complete for the selected-source case | Cold time fell 34.6 percent. Finding attachment time fell 99.4 percent. |
| 6. Refactor the largest modules | No longer a prerequisite | Make only focused extractions that a current change requires. |
| 7. Update the documents | Complete through this reconciliation | This document replaces stale status labels as the planning authority. |
| 8. Define the next supported transform set | Current product frontier | Add one real syntax family at a time. |

## Active next slice

### Direct top-level scalar proof

Answer one product question:

Can a direct source field read produce the same exact proof as a supported
collection item field?

Add one grammar for `snapshot()?.field` reads that reach render terminals.
Reuse the current carrier, identity, attachment, and UI paths.

Positive examples:

- `teamDisplayName` reaches the team heading in `AppShell`.
- `seasonName` reaches the season label in `AppShell`.

Negative and regression examples:

- `schemaVersion` stays available without route proof.
- An unrelated equal-name field stays absent.
- Existing `games[*]` attachments stay unchanged.
- `projects[*].code` stays an `unsupported-transform` frontier.

Also replace `Available · not proven` with
`Available · no proven route use`.

Stop after direct scalar reads work. Do not add collection operations in this
slice.

## Decision after the active slice

Choose one of these paths from product evidence. Do not start both.

### Option A — Add one collection operation

Use a real route need. The current candidate is
`availability[*].status` through `.filter`.

Prove one collection item field and one exact consumer. Keep `map`, aggregation,
destructuring, spread, and rename outside that slice.

### Option B — Plan route cutover

Audit the remaining current renderer and legacy analysis support. Decide which
questions still require them.

Only then plan their removal. The cutover must preserve source selection,
field focus, findings, code navigation, refresh state, and honest gaps.

## Deferred backlog

These items need a separate product decision:

- broader collection grammar for `players[*]`, `schedules[*]`, and `liveGames[*]`;
- destructuring, object construction, spread, rename, and derived scalar proof;
- a broader type-and-transform view;
- finding shared-cause grouping, blast radius, and semantic reanalysis;
- read, interaction, write, and reconciliation flow;
- a repository atlas across routes, commands, endpoints, and handlers;
- evidence-backed agent investigation packets;
- representative Pluck-scale performance proof; and
- focused module cleanup required by a current change.

Do not convert this backlog into one implementation program.

## Retired requirements

Do not carry these historical requirements into new plans:

- frozen production-build browser gates;
- fixed route IDs, ports, generations, or graph counts;
- exact SVG positions;
- the retired raw proof graph renderer;
- soccer-specific production target selectors; and
- automatic execution of Projects 6 through 10.

Current repository rules prohibit build commands during agent verification.
Use lint, typecheck, the maintained acceptance runner, and a fresh development
browser service when the task requires them.

## Document authority

| Document | Current role |
|---|---|
| `20260802-unified-flow-analysis-rewrite-raw-plan.md` | Original shaping artifact. |
| `execution-plans/README.md` and Projects 1–10 | Historical roadmap and project detail. |
| `20260805-projects-1-5-reconciliation-and-completion-plan.md` | Historical Projects 1–5 reconciliation. |
| `20260808-project-4-1-field-to-component-parity-plan.md` | Superseded field-flow plan. |
| `20260809-project-4-1-product-closure-retrospective.md` | Historical failed-closure review. |
| `20260810-project-4-1-transformation-ledger-implementation-plan.md` | Implemented ledger contract and acceptance design. |
| `20260811-restore-field-flow-thread-retrospective.md` | Final process and implementation retrospective. |
| `20260811-incremental-generic-field-discovery-plan.md` | Detailed record for the current field-coverage track. |
| This document | Current cross-plan status and outstanding-work authority. |

