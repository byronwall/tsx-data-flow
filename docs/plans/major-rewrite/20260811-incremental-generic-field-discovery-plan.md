---
title: "Incremental generic field discovery"
status: complete — next coverage slice proposed
last_updated: 2026-08-14
---

# Incremental generic field discovery

Cross-plan status: See
[Major rewrite status and outstanding work](20260814-major-rewrite-status-and-outstanding-work.md).

## Status

The original plan and its latency follow-up are complete.

The product now has generic field discovery and explicit field focus. The
soccer-specific target list is no longer part of production discovery.

Route Totality polish and the first measured latency repair are complete.

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

Key completion commits:

- `e1ef643` — polish Route Totality interactions.
- `a4daea1` — reduce selected-source attachment latency.
- `8cd3734` — show selected field paths on render terminals.

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

## Completed latency slice

The selected-source latency task found one dominant cost. Finding attachment
resolution repeatedly scanned targets that could not match an identity.

Commit `a4daea1` groups finding identities by exact location before expression
resolution. It changes one production module.

Reported results on the same machine and commit:

- Cold selected-source time fell from 52.21 seconds to 34.16 seconds.
- Total cold time fell by 34.6 percent.
- Finding attachment time fell from 23.89 seconds to 0.14 seconds.
- The dominant stage fell by 99.4 percent.
- The result kept 18 attachments, zero frontiers, and 62 transformations.
- The payload stayed at 354,933 bytes.
- The proof hash stayed unchanged.
- G01–G18, the compact frontier, and the equal-name control passed.
- Fresh browser verification passed without runtime or hydration errors.
- Lint and typecheck passed with three existing warnings.

This completes the measured performance slice. The remaining delay is no
longer the product question recorded by this plan.

## What `Available · not proven` means

The picker combines two independent facts:

1. `Available` means the selected source type contains the field.
2. `Proven` means analysis produced an exact attachment to a route consumer.

The current proof discovery starts from a narrow collection pattern. It finds
`snapshot().games.find(...)`, its selected item, and supported consumers.

It does not yet discover all direct scalar reads or all collection operations.
Therefore, `not proven` does not always mean unused. It can also mean that the
current proof grammar does not understand the read.

For example, the soccer route renders `teamDisplayName` and `seasonName` in
`AppShell`. These source fields have real consumers, but no attachments.

Collection parents need item proof. The useful target is
`availability[*].status`, not the `availability` container by itself.

## Next useful slice — Direct top-level scalar proof

### Product question

Can a direct source field read produce the same exact proof as a supported
collection item field?

### Scope

Add one direct grammar for `snapshot()?.field` reads that reach render
terminals. Reuse the current carrier, identity, attachment, and UI paths.

Do not add filter, map, aggregation, object-property, or collection grammar in
this slice.

Change the empty status text to `Available · no proven route use`. This is
accurate when a field has no attachment or frontier.

### Positive examples

- `teamDisplayName` → the team name in `AppShell`.
- `seasonName` → the season name in `AppShell`.

Both rows must show exact consumers after source and field selection.

### Negative and control examples

- `schemaVersion` stays available without proof on this route.
- An unrelated equal-name consumer stays absent.
- Existing `games[*]` proofs stay unchanged.
- `projects[*].code` stays an unsupported-transform frontier.
- No selected field still produces no field-specific green.

### Acceptance

- Produce exact source, field-read, occurrence, and terminal identities.
- Keep one attachment for each distinct consumer occurrence.
- Keep existing attachment and frontier records unchanged.
- Run lint and typecheck.
- Use the maintained acceptance runner after approved test work.
- Verify the two positive fields and one negative field in a fresh browser.

### Stop point

Stop after direct scalar reads work. Use a separate product decision for
collection operations such as `filter`, `map`, and aggregation.

## Deferred work

- Collection-operation proof for `availability[*]` and `players[*]`.
- Multi-field graph focus.
- Transform visualization changes.
- Overlapping edge-target refinement.

Each item needs direct product evidence before implementation.
