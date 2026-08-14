# Project 4.1 product closure retrospective

Date: 2026-08-09

Status: Proposal for review

Scope: Project 4.1 planning, orchestration, implementation, and verification

## Summary

Project 4.1 produced substantial field-lineage machinery. It did not restore a useful field-flow experience on a real source-backed page.

The work treated internal architecture as the completion target. The user target was visible parity with the prior trajectory view.

The implementation could pass every stated check while producing zero useful field attachments. This was a planning failure.

Future plans must pair two equal gates:

- Precision: do not show unproven lineage.
- Utility: show proven lineage on at least one real application route.

A positive-evidence feature cannot pass with zero positive records.

## Original user outcome

The intended outcome was direct and visible:

```text
select a source
  -> see its proven fields
  -> see those fields on real component occurrences
  -> follow the green path to render terminals
  -> inspect the same fields and proof
```

The prior data trajectory view established the interaction model. A selected source immediately changed the visible graph evidence.

Route Totality needed to restore that behavior with stronger proof rules.

## What the work delivered

The work added or strengthened these parts:

- a bounded field-lineage domain model;
- fail-closed transition classification;
- occurrence and terminal anchors;
- field attachment and frontier records;
- strict DTO projection and validation;
- field-focus state and URL restoration;
- inspector field and frontier sections;
- existing green field-path presentation;
- bounded evidence and cancellation behavior.

These parts are useful. They are enabling work. They do not prove the user outcome.

## What the real application showed

A 14-route audit provided the decisive evidence.

- Thirteen routes returned valid DTOs.
- All successful source-backed routes had zero attachments.
- Only `/login` produced field-lineage records.
- `/login` produced two stopped frontiers and zero attachments.
- `/games/[gameId]/schedule` returned an HTTP 500 projection error.
- `/games` and `/roster` contained proven field reads and render terminals.
- Traversal still stopped before field identity reached those consumers.

The primary positive route therefore had no useful field-flow result.

## Causal chain

### 1. The plan translated a product outcome into internal deliverables

The plan emphasized a bounded field projection, proof policy, validation, and UI states.

It did not make one real positive route a closure requirement.

### 2. The first implementation slice was too narrow

The first worker brief asked for one direct root-property case.

It explicitly deferred full green-path parity and cross-component continuity.

This was valid enabling work. It was not a useful vertical product slice.

### 3. Source selection was deferred behind an artificial milestone boundary

The source picker writes the legacy `source` state.

Route Totality reads a separate `totalitySelection` identity.

Selecting a source therefore did not activate the matching Totality origin.

The plan placed this integration in Project 4.2. Project 4.1 still depended on it for normal use.

### 4. Verification checked stability instead of usefulness

One browser verification checked these results:

- the URL loaded;
- Route Totality rendered;
- earlier exceptions were absent;
- state survived refresh;
- the browser console was clean.

All checks passed. None required a visible field attachment.

The verifier followed its brief correctly. The verification brief was incomplete.

### 5. A later audit found zero positive records

The later route matrix showed zero attachments across all successful source-backed routes.

This should have reopened the milestone immediately.

The process instead treated the result as an analyzer limitation beside otherwise completed UI work.

### 6. Fail-closed behavior became a substitute for useful behavior

The team correctly rejected equal-name joins and ambiguous carrier transitions.

However, an honest empty result became acceptable without a positive control.

Precision without utility is not field-to-component parity.

## Root process failures

### Product closure was not explicit

The plan did not state what a user must see after one normal interaction.

### Acceptance allowed a vacuous pass

Zero attachments satisfied every listed safety rule.

### Work was divided by architecture layer

Workers completed analyzer, DTO, state, and UI scopes independently.

No worker owned the full visible journey.

### Integration dependencies were deferred

Source selection was required for discoverability but lived in a later milestone.

### Browser verification inherited recent bug symptoms

The verifier checked fixed errors and rendered state. It did not receive the original product job.

### Synthesis treated worker completion as feature completion

Each worker completed its assigned scope. The combined result still failed the user goal.

## Required planning changes

### 1. Add a user-visible outcome contract

Every user-visible feature plan must start with this contract:

```text
User action:
Primary fixture:
Required visible result:
Required inspector result:
Required persistence result:
Negative fixture:
Forbidden false positive:
```

For Project 4.1, use this contract:

```text
User action:
Select readFile in the normal source picker.

Primary fixture:
/games/[gameId] in the soccer-schedule application.

Required visible result:
At least one exact field appears on a real component occurrence.
One green exact-lineage path reaches a render terminal.

Required inspector result:
The component inspector lists the same proven field and proof location.

Negative fixture:
/login with import.meta.env and field DEV.

Forbidden false positive:
No component field appears after identity becomes ambiguous or unsupported.

Presentation requirement:
The stopped frontier stays visible without shrinking or fading the route topology.
```

### 2. Require positive and negative fixtures

Every proof-sensitive feature needs both fixtures.

The positive fixture proves useful reach.

The negative fixture proves conservative behavior.

Neither fixture can replace the other.

### 3. Add a no-vacuous-pass rule

Use this rule in plans, worker briefs, and verification:

> A positive-evidence feature cannot pass with zero positive records.

For field parity, require these minimum counts:

```text
attachments >= 1
component occurrences >= 1
render terminals >= 1
visible field labels >= 1
inspector field records >= 1
```

These counts are necessary. They are not sufficient for correctness.

### 4. Make the first slice vertical

The first implementation slice should cross all required layers:

```text
one selected source
  -> one exact carrier path
  -> one compiler-backed consumer field read
  -> one exact component occurrence
  -> one exact terminal
  -> one green path
  -> one inspector record
```

Generalization should follow this proven slice.

### 5. Label task types

Every task must use one label:

- `enabling`: creates internal capability;
- `outcome`: completes a user-visible result;
- `verification`: independently checks the result.

Enabling tasks cannot close a milestone.

### 6. Keep activation dependencies with the outcome

Do not defer a control integration when the current feature depends on that control.

Review these questions before execution:

- What normal control starts the feature?
- Does it write the identity that the new system reads?
- Can a user reach the result without a handcrafted URL?
- Does refresh preserve the selected identity?
- Does selection preserve useful camera and inspector state?

Any required missing integration belongs in the current outcome task.

### 7. Add a prior-art parity table

Use the prior trajectory view as normative UI evidence.

| Prior behavior | Required Route Totality behavior |
| --- | --- |
| Source selection activates flow | The same action selects one exact origin |
| Green paths appear immediately | Proven green paths appear immediately |
| Field names appear near consumers | Proven labels appear on exact occurrences |
| Topology remains readable | Focus does not collapse route context |
| Inspector explains selection | Inspector lists fields, proof, and stops |
| Unsupported paths stay absent | Unsupported paths stop at explicit frontiers |

Attach a prior-view screenshot to the implementation brief.

Require a new mock only for a new layout, control, or information hierarchy.

### 8. Add a vacuous-success review before execution

A reviewer must answer these questions:

1. Can all checks pass with zero useful output?
2. Can the feature work only through a handcrafted URL?
3. Can each worker finish without exercising the main user action?
4. Can a negative-only fixture be mistaken for success?
5. Is required discoverability deferred to another milestone?
6. Does verification check presentation and record existence?
7. Does the plan preserve the useful prior behavior?

Any `yes` answer blocks execution until the plan changes.

## Required skill changes

These are proposed edits. Do not apply them until review approves them.

### `$propose-fixes`

Add a required `Product closure contract` section.

Require these items:

- original user job in the user's terms;
- current visible failure;
- one positive real fixture;
- one negative real fixture;
- minimum useful result;
- prior behavior to preserve;
- exact browser completion script;
- a direct answer to `Can this proposal pass vacuously?`.

Reject proposals that list only internal fixes.

Each option must state whether it restores the normal user journey.

An option that needs later integration is not a complete option.

### `byronize-task-list`

Change the split rules:

- Make Task 1 a vertical visible slice when practical.
- Label each task as enabling, outcome, or verification.
- Do not let enabling tasks close a milestone.
- Give each outcome task one real fixture.
- Include user action and visible acceptance evidence.
- Keep discoverability and activation dependencies with the outcome.
- Map each original requirement to one owner and one verifier.
- Review for remaining architecture invention.
- Review separately for unverified product behavior.

Use this task template:

```text
Type:
Outcome:
Fixture:
User action:
Visible evidence:
Analyzer evidence:
Forbidden false positives:
Files owned:
Static checks:
Browser checks:
Completion evidence:
```

### `orchestrate-work`

Add these completion rules:

- Preserve the original user outcome in every synthesis.
- Treat worker completion as scope completion only.
- Compare the combined result with the original user action.
- Give the final verifier the original product job.
- Do not give only recent bug symptoms.
- Require the verifier to find and use the control without coaching.
- Reopen implementation when a positive fixture has zero results.
- Do not accept a clean console as feature completion.
- Do not accept a rendered shell as feature completion.

### `fix-route-data-flow`

Add these positive-flow rules:

- Require `--expect-component` for positive repair work.
- Add an expected terminal or terminal count.
- Treat zero attachments as failure for positive flow requests.
- Report attachment counts beside trajectory path counts.
- Require one named consumer field to reach one exact occurrence.
- Require a rejected component or field to remain absent.
- Compare the normal UI selection with the API result.
- Diagnose source-picker identity mismatch as a separate layer.
- Diagnose unreadable camera bounds as a separate presentation layer.
- Do not claim completion from `handoffProven` alone.
- Do not claim completion from path counts alone.
- Do not claim positive completion from frontier records alone.

## Required repository guidance changes

These are proposed edits for `AGENTS.md` after review.

### Product closure rule

```text
For a user-visible analyzer feature, static checks are not completion.
Use at least one real positive fixture.
Exercise the normal user control.
Verify the expected visible evidence.
A zero-record result cannot close a positive-evidence feature.
Keep negative precision checks beside positive utility checks.
```

### Manual verification rule

```text
Deferred test work does not defer manual browser acceptance.
Lint and typecheck prove code health. They do not prove product usefulness.
```

### Orchestration closure rule

```text
Do not infer feature completion from worker completion.
The orchestrator must verify the combined result against the original user action.
```

## Required Project 4.1 plan changes

Update the active Project 4.1 plan after review.

- Merge minimum source-selection wiring from Project 4.2 into Project 4.1.
- Name `/games/[gameId]` and `readFile` as the positive closure fixture.
- Require one real component and terminal attachment.
- Name `/login` and `import.meta.env` as the stopped negative fixture.
- Require readable bounds for frontier-only evidence.
- Add the prior green trajectory screenshot as normative evidence.
- Define the approved carrier-continuity path.
- Keep source identity separate from field identity.
- Start field identity only at a compiler-backed consumer read.
- Require browser verification through the normal source picker.
- Keep the milestone open while the positive fixture has zero attachments.

## Proposed maintained acceptance matrix

Create a small project fixture file or script-owned JSON document.

| Fixture | Expected result |
| --- | --- |
| `/games/[gameId]` plus `readFile` | Positive field attachment and terminal |
| `/roster` plus `readFile` | Positive field attachment and terminal |
| `/login` plus `DEV` | Explicit stopped frontier and readable topology |
| `/games/[gameId]/schedule` | Valid DTO and no projection exception |

The diagnostic command should print this matrix before and after changes.

## Better execution sequence

1. Capture the prior behavior and parity target.
2. Run the real-route baseline.
3. Record zero attachments as a failed baseline.
4. Trace the first missing proof seam.
5. Implement one end-to-end vertical slice.
6. Activate it with the normal source picker.
7. Verify the positive route in the browser.
8. Verify the negative route in the browser.
9. Review false positives and shared-definition leakage.
10. Generalize only after the vertical slice works.
11. Refactor focused modules after behavior is stable.
12. Run lint and typecheck.
13. Ask whether to enter the deferred test phase.

## Completion evidence template

Use this report for future user-visible analyzer work:

```text
Original user action:
Positive fixture:
Before counts:
After counts:
Visible fields:
Reached component occurrences:
Reached terminals:
Negative fixture:
Forbidden matches absent:
Frontier behavior:
Camera and readability result:
Refresh result:
Console result:
Lint result:
Typecheck result:
Deferred test work:
```

## Review checklist

- Does the plan state what the user will see?
- Does one real positive route prove that result?
- Does one real negative route prove conservative behavior?
- Can zero output still pass any closure gate?
- Does the normal control activate the new system?
- Does the plan preserve useful prior behavior?
- Does browser verification use the original user job?
- Does the orchestrator own the combined result?
- Does every original requirement have an owner and verifier?
- Does any implementation choice remain for a worker to invent?

The work is complete only when all answers support the original user outcome.
