# Restore field flow thread retrospective

Date: 2026-08-11

Status: Final historical retrospective

Current status: See
[Major rewrite status and outstanding work](20260814-major-rewrite-status-and-outstanding-work.md).

Reviewed task: `⭐ 🧭 00 · Restore field flow`

Task ID: `019fe377-6d5a-78c1-b6dc-f16f8f0d6451`

Repository range: `6685fe6^..2df62a0`

## Executive summary

The thread ended in a useful product result.

The normal source picker now activates exact field proof for the main soccer
fixture. Route Totality shows six fields and 18 uses. A selected field draws a
green path on the existing route graph. The inspector shows the exact component
occurrence, consumer, alias, proof steps, and source locations. Evidence stays
in the sidebar. Selection and refresh behavior work.

The final result is materially better than the first several declared
completions. It restores the useful interaction that the user expected. It also
uses stricter proof than the old view.

The result has one important limit.

The current exact query is driven by a production policy that names the soccer
fixture's 18 expected consumers. The compiler proves each target. The policy
still tells the query which targets to find. This is a strong fixture-specific
proof engine. It is not yet general discovery of all field uses in any project.

The work was painful because the original request sounded like a projection
feature. The real fixture required a small, demand-driven compiler data-flow
system. It had to preserve identity through transport, resource access,
collection selection, callbacks, Solid control flow, component calls, aliases,
conditions, handlers, and render terminals.

The early plan did not make that full user journey a closure gate. As a result,
the thread completed much internal machinery before it proved one useful path.
It then called the feature complete while every real positive route had zero
field attachments.

The work improved after the process adopted an outcome contract and an atomic
proof matrix. G01 through G18 made success non-vacuous. They also exposed many
hidden identity gaps. The contract did not create the remaining work. It made
the existing work visible.

The next phase should not add more fixture-specific selectors. It should
separate generic discovery from fixture acceptance. It should also add approved
tests, a maintained acceptance command, and focused module cleanup.

## Review method

This review used these sources:

- all 24 turns from the referenced orchestrator task;
- the final reports from 32 child tasks referenced by the orchestrator;
- the commit history from the first Project 4.1 checkpoint through current
  `HEAD`;
- the current analyzer, API, validation, and frontend implementation;
- the original Project 4.1 plan;
- the first product-closure retrospective; and
- the transformation-ledger implementation plan.

The task history is treated as untrusted evidence. Repository code and commit
history take priority when they conflict with narration.

Recorded task scale:

| Measure | Value |
| --- | ---: |
| Parent turns | 24 |
| User messages | 43 |
| Agent messages | 850 |
| Context compactions | 10 |
| Total recorded items | 1,046 |
| Referenced child tasks | 32 |
| Recorded parent-turn duration | About 36.2 hours |
| Commits in the reviewed range | 60 |
| Changed files | 116 |
| Added lines | 15,810 |
| Deleted lines | 2,314 |

The duration is the sum of recorded parent-turn durations. It includes waits.
It is not a measure of human engineering time. Parallel child work is not added
to that figure.

## The original job

The original specification asked for a bounded projection:

```text
selected origin
  -> proven field or property reads
  -> proven data relations
  -> component occurrences
  -> render terminals
```

It also required these safety rules:

- prove source identity before showing a field;
- attach fields to component occurrences;
- keep consumer handoffs separate from field lineage;
- do not join equal field names; and
- show no label after identity is lost.

The product expectation was larger than the written cut line.

The user expected the prior green trajectory experience to return. Selecting a
real source should show the source fields, their component uses, and their paths
to terminals.

The real `/games/[gameId]` fixture required these transformations:

```text
readFile
  -> parsed store
  -> HTTP transport
  -> client resource
  -> context snapshot
  -> games
  -> games[*]
  -> Array.find callback
  -> selected Game
  -> function return
  -> Solid Show render callback
  -> nested property read
  -> direct consumer or component prop
  -> condition, handler, or render terminal
```

The initial Project 4.1 text deferred field renames, packing history,
derivation, and complete transformations. The positive fixture depended on
several neighboring capabilities. This made the apparent scope much smaller
than the real closure scope.

## What the repository now contains

### A preserved broad route graph

Route Totality keeps the broad occurrence and terminal topology. Field focus is
an overlay. It does not replace the route graph.

The final browser report recorded 284 marks in the broad All Sources state.
Earlier checks used smaller focused projections. This explains several count
changes in the task history.

### Exact selected-source activation

The normal source control now passes the selected source identity into route
analysis. The backend does not depend on the source entering a bounded slice by
chance.

The selection includes the exact evidence identity. It survives refresh. Clear
and reselect behavior no longer leaves stale graph selection state.

### Compiler-backed evidence collection

The analyzer now records facts needed for exact field proof. These include:

- source carriers;
- transport boundaries;
- collection-element bindings;
- callback parameters and returns;
- Solid `Show` bindings;
- component occurrences and definitions;
- component prop bindings;
- direct render consumers;
- conditions;
- handlers;
- forwarded handler parameters; and
- occurrence-owned render boundaries.

This evidence is useful beyond the final UI. It gives future analysis a stronger
compiler-backed vocabulary.

### A transformation ledger

The exact query builds named transformation records. The current positive result
contains 62 transformations for 18 field-to-use attachments.

Each attachment contains:

- one selected origin;
- one exact field path;
- one component occurrence;
- one consumer descriptor;
- one terminal;
- ordered transformation IDs;
- evidence relations;
- proof locations; and
- an optional alias.

The model distinguishes source identity, field identity, occurrence identity,
consumer identity, and terminal identity.

### Strict API validation

The API has strict schemas and semantic validation for the ledger.

Validation checks include:

- deterministic IDs;
- exact selected-source identity;
- exact evidence endpoints;
- fully proven relations;
- transformation order;
- occurrence ownership;
- consumer target descriptors;
- direct versus component consumers;
- exact consumer-to-terminal relations;
- alias identity;
- frontier reasons; and
- stable counts and ordering.

The validator recomputes semantic IDs. It does not only trust transported IDs.

### Fail-closed frontiers and bounds

The query emits explicit frontiers when it cannot prove a transition. It also
fails closed on ambiguity and search-budget exhaustion.

The carrier search has fixed depth and state limits. Frontier output also has a
cap. Cancellation checks exist in the expensive projection paths.

### A useful field inventory and focus model

For the approved fixture, selecting `readFile` now shows:

- six proven field paths;
- 18 named uses;
- four explicit `games[*].id -> gameId` aliases; and
- groups for the exact component occurrences.

Selecting `games[*].opponentName` highlights five green edges through six nodes
to `PageHeader.title`.

The inspector separates:

- field lineage;
- whole-object component handoffs;
- consumer kinds;
- aliases;
- proof steps;
- exact source locations; and
- stopped continuity.

### A simpler evidence experience

The raw evidence graph is no longer a normal renderer choice. Legacy Evidence
URLs normalize to Route Totality.

The retained evidence is available in the sidebar. Opening it does not add a
dense evidence lane or change graph geometry.

### One active field-lineage engine

The final cutover removed the old route field traversal. Selected-source proof
uses the ledger. The no-source state is an explicit neutral projection.

This removes one major source of contradictory field results.

## The most important implementation limit

The exact ledger is not yet target-independent.

`src/analysis/route-totality-field-proof-policy.ts` contains
`FIELD_PROOF_TARGETS`. It names all 18 soccer consumers. Examples include:

- `PageHeader.title`;
- `Show.when completed branch`;
- `deleteGame.id`;
- `ScheduledGamePlanningDetails venue`; and
- `Completed A.href live`.

The target records include fixture field names, component names, prop names,
module names, action names, condition literals, and collection names.

The compiler proves that a candidate matches each declared target. This is not
simple label matching. It is still declared-target execution.

The phrase “all proven fields” therefore has a bounded meaning today:

> All fields proven for the declared Project 4.1 target set on the selected
> fixture.

It does not yet mean:

> Discover every provable downstream field use for an arbitrary selected source
> in any project.

This distinction does not invalidate the result. It defines the next product
and architecture step.

## How the work progressed

### Phase 1: Architecture-first planning

The thread began with several read-only workers. They found valid evidence
primitives and one critical missing join across component props.

The first plan became detailed. It specified domain records, transition rules,
occurrence identity, DTO validation, UI states, worker splits, and five
milestones.

This reduced worker invention. It did not define one real positive route as the
non-negotiable completion result.

### Phase 2: Exactness machinery

The first implementation added a bounded field-lineage slice. Several review
cycles then closed proof gaps.

The work added exact component bindings, stable identities, stricter receiver
rules, ownership metadata, frontiers, cancellation, and focused modules.

It also fixed unrelated integration failures exposed by the new code:

- duplicate destructured-parameter identities;
- a browser import of `node:path`; and
- strict schema and projection mismatches.

These fixes improved the repository. They still did not prove the user journey.

### Phase 3: The first false closure

The implementation reached a state with clean static checks and clean browser
shell behavior. The thread called Project 4.1 complete.

A later fixture scan showed the decisive problem:

- 14 non-empty page routes were checked;
- no route had a browser-visible field attachment;
- some routes had stopped frontiers; and
- broad route paths still existed.

The feature was precise but not useful. The checks had passed vacuously.

This was the largest process failure in the thread.

### Phase 4: First real positive path

The thread then adopted a hybrid repair. It passed the selected source into the
backend and added a bounded carrier lane.

The work found several cross-layer defects:

- the route-detail request dropped the selected source;
- awaited call aliases were not collected;
- `app/src/...` roots failed a `src/...` check;
- the live source ID differed from the fixture ID;
- automatic UI focus selected the wrong origin; and
- the first browser pass still showed zero attachments.

After repair, the real browser showed one proven `games` path and one component
occurrence. This was the first genuine vertical result.

### Phase 5: Visual recovery

The first positive path used a detached evidence lane. That lane changed SVG
bounds and made the graph look random and sparse.

The redesign reused the existing route topology. Green proof now overlays
existing nodes and edges. Evidence details moved to the inspector.

This was the correct product model:

```text
application topology
  + selected proof overlay
  + sidebar explanation
```

The evidence graph was a debugger. It was not a useful peer application map.

### Phase 6: The outcome contract

The user asked why the work had missed so badly. The resulting retrospective
defined a stronger planning rule:

> A positive-evidence feature cannot pass with zero positive records.

The transformation-ledger plan then named:

- the exact user action;
- the `/games/[gameId]` fixture;
- the `readFile` source;
- six field paths;
- 18 atomic obligations, G01 through G18;
- three consumer kinds;
- three target component occurrences;
- whole-object and scalar-alias handoffs;
- persistence behavior;
- a small negative set; and
- a clean-room browser script.

This was the turning point.

### Phase 7: G01 through G18 expansion

The thread first proved G02. It then split direct consumers from component
handoffs and alias work.

The combined implementation reached 18 attachments. Independent review found
that some identities were still too weak. Browser review also found that the
new fields were hidden or unstable.

Several apparent successes were invalidated:

- child components borrowed a parent terminal;
- handler and link targets lacked full target identity;
- directness existed only in query policy;
- first-match behavior hid ambiguity;
- consumer terminals used containment instead of exact relations; and
- Solid state effects cleared source or field focus during loading.

The final implementation repaired each case. It then removed the legacy
traversal and fixed the source-reselect regression caused by that cutover.

## Why the thread was so painful

### The feature was misclassified

The request sounded like a projection of existing facts. The real positive
fixture required new facts and new transfer semantics.

The work was closer to a bounded compiler feature than a frontend summary.

### The original cut line conflicted with the fixture

The specification deferred transformations that the real route used. The
implementation could honor the narrow text or restore the expected product.
It could not do both without revising the scope.

This conflict remained implicit for too long.

### There were several different identities

The system had to preserve these identities independently:

1. selected source identity;
2. evidence element and relation identity;
3. field path identity;
4. component occurrence identity;
5. consumer identity; and
6. terminal identity.

Many failures came from treating two identities as interchangeable.

Examples include:

- source picker ID versus evidence origin ID;
- component definition versus occurrence;
- child occurrence terminal versus parent terminal;
- consumer terminal versus component handoff terminal; and
- display label versus compiler symbol.

### Proof facts crossed too many boundaries

One new fact often needed changes in all these places:

```text
compiler collector
  -> persisted program evidence
  -> lazy relation provider
  -> bounded slice
  -> exact query
  -> transformation ledger
  -> API projection
  -> strict schema
  -> semantic validator
  -> frontend model
  -> graph emphasis
  -> inspector
  -> URL and lifecycle state
```

A missing field in any layer could turn a valid analysis into an empty or
rejected UI result.

### Fail-closed behavior made errors look like empty success

Fail-closed semantics were correct. They also hid progress.

Before the positive contract, zero attachments could mean any of these things:

- the route had no provable field use;
- the selected source was missing;
- a carrier was absent;
- a binding was ambiguous;
- a validator rejected the DTO;
- the UI lost focus; or
- the feature had not implemented the required transform.

The gray graph did not explain which layer failed.

### Verification initially tested recent bugs

Early clean-room briefs checked whether the page loaded, an exception was gone,
refresh worked, and the console was clean.

Those were useful checks. They did not test the original product job.

The verifier later received the correct requirement: use normal controls and
show one named green field path. That change exposed real failures quickly.

### Exactness review came after breadth

Several full 18-record results later failed semantic review.

The invalid shortcuts included borrowed terminals, incomplete handler identity,
text-derived component identity, and first-candidate selection.

A narrow exactness gate on G02 before the broad expansion helped. It still did
not cover the different proof shapes used by handlers, conditions, whole-object
props, and scalar aliases.

### The all-target gate was safe but diagnostically expensive

The final query requires every declared target. One missing target can produce a
frontier instead of a partial positive inventory.

This was useful for Project 4.1 closure. It prevented a partial result from
looking complete.

It is less useful as a general runtime model. One missing consumer can hide 17
valid consumers. Runtime output and acceptance policy should be separate.

### Runtime and environment state caused false signals

The thread encountered:

- stale bundled client assets;
- fresh source with an old server;
- wrong frontend and backend combinations;
- HMR during parallel edits;
- port setup problems;
- a root path mismatch;
- sandbox IPC restrictions; and
- fixed command windows that ended long analyzer runs.

Some earlier browser passes reused servers and hid fresh-start contract errors.

### Parallelism helped discovery but not final integration

Parallel read-only reviews were effective. Separate frontend and analyzer edits
also worked when ownership was clear.

The central query, schema, validator, and occurrence-terminal model remained one
integration bottleneck. More workers could not safely remove that dependency.

The shared checkout also meant browser evidence could become stale while another
worker changed backend files.

### The orchestration loop was too noisy

The parent task contains 850 agent messages. Many messages only report another
wait or completed command.

This preserved transparency. It also made the causal record difficult to read
and contributed to 10 context compactions.

The thread needed milestone summaries, not a narration for every worker wait.

## Why the outcome contract helped

The outcome contract changed the unit of truth.

Before the contract, the unit of truth was an internal artifact:

- a record existed;
- a schema parsed;
- a graph rendered; or
- a frontier was honest.

After the contract, the unit of truth was a named user-visible relationship:

```text
games[*].opponentName
  -> PageHeader occurrence
  -> title consumer
  -> exact terminal
  -> green path
  -> inspector proof
```

G01 through G18 also made partial claims easy to reject. Counts could support
the gate. Counts could not replace the named records.

The contract connected four forms of proof:

| Gate | Question |
| --- | --- |
| Analyzer | Does the compiler-backed chain exist? |
| API | Can the exact chain survive transport and validation? |
| Product | Can the user see and inspect it? |
| Precision | Do mutations and unrelated identities fail closed? |

This is the process pattern worth keeping.

## Why it still took so long after the contract

The contract exposed the true debt in one step.

The 18 obligations were not 18 copies of one proof. They covered different
semantic shapes:

- direct JSX render values;
- nested template expressions;
- equality and inequality conditions;
- nested Solid `Show` controls;
- direct router link props;
- direct action handlers;
- forwarded action parameters;
- whole-object component props;
- receiver property reads; and
- scalar prop aliases.

Each shape required exact ownership and terminal proof.

The contract also prevented the thread from keeping shortcuts. Independent
review repeatedly removed results that were visually plausible but not exact.

The work therefore became slower but more truthful.

One process choice increased the time further. The implementation expanded the
declared fixture matrix inside the production query before it separated generic
discovery from acceptance. This made fixture closure and engine architecture the
same task.

## What went well

### The final user journey is real

The last browser gate used normal controls. It did not depend on a handcrafted
URL.

It verified field inventory, green focus, aliases, clear behavior, refresh,
inspector state, and a clean console.

### Independent review found real defects

Semantic reviewers rejected several believable false proofs. Browser reviewers
found several real state and presentation failures.

The review loops were expensive. They were effective.

### The thread did not relax identity rules to get green lines

The implementation did not use equal names as lineage. It replaced weak joins
with compiler symbols, exact relations, and explicit ambiguity.

### The UI converged on the right information model

Route Totality remains the map. Field proof is an overlay. Evidence explains a
selected claim in the sidebar.

This is simpler than three competing graph renderers.

### Luna-first model use was mostly disciplined

The orchestrator kept new work on Luna. It escalated only after concrete failed
repair cycles. Sol received a narrow two-candidate problem, not open discovery.

This controlled cost, even though it increased elapsed time.

### The legacy engine was removed

The final cutover did not leave two active field-lineage implementations.

This reduces future inconsistency.

## What remains weak

### There are no approved regression tests for the new behavior

The thread followed repository policy. It did not update tests or run
`pnpm verify`.

The current confidence comes from static checks, focused diagnostics, mutation
probes, and browser work. Much of that evidence lives in task history rather
than maintained repository automation.

### Fixture policy is embedded in production analysis

The G01 through G18 selectors should not remain the general engine's discovery
policy.

They are valuable acceptance data. They belong in a fixture contract, test
fixture, or diagnostic configuration.

### Runtime semantics and closure semantics are coupled

The query can suppress valid partial attachments when one declared target is
missing.

The product should show every exact proven result and every exact frontier.
The acceptance runner can still require all 18 fixture obligations.

### Performance evidence is incomplete

Some fresh proof runs exceeded a 30-second command window. An eager terminal
approach exceeded fixture memory. The final browser result passed, but the plan's
warm and cold timing report was not preserved in the final parent summary.

### Several modules remain large

Current strong extraction signals include:

| File | Lines |
| --- | ---: |
| `program-evidence-carrier.ts` | 633 |
| `RouteTotalityGraph.tsx` | 556 |
| `route-totality-field-proof-candidate.ts` | 548 |
| `route-totality-field-transfer-verifier.ts` | 511 |
| `route-totality-field-lineage-transition.ts` | 449 |

These files contain central behavior. They deserve focused cleanup after tests
exist.

### Some names still describe the first milestone

Validation messages and comments still refer to “Milestone 1.” The model now
implements a larger ledger.

The stale names make the architecture harder to understand.

### Planning documents have stale status

The transformation-ledger plan still says “Do not execute without approval.”
It has been executed.

The first retrospective describes the earlier failed state. That document is
still valuable, but it needs a link to the final closure record.

Both earlier documents are currently untracked, as is this review draft.

## Recommended next work

This list records the recommendation at the end of the reviewed task. The
[current status document](20260814-major-rewrite-status-and-outstanding-work.md)
reconciles each priority against later work.

### Priority 1: Close the repository evidence gap

Ask for approval to enter the test phase.

After approval, add maintained checks for:

- G01 through G18 positive proof;
- the six unique field paths;
- whole-object component bindings;
- `id -> gameId` scalar aliases;
- exact handler and link identities;
- occurrence-owned terminals;
- stable DTO IDs and deterministic ordering;
- selected-source activation;
- clear and reselect behavior;
- refresh persistence;
- the `/login` stopped frontier; and
- one unrelated equal-name negative case.

Then run `pnpm verify` as the repository gate.

### Priority 2: Create one maintained acceptance runner

Move the useful one-off diagnostics into a project script.

Suggested input:

```text
project root
route
selected source locator
expected obligation file
```

Suggested output:

```text
selected origin
field paths
attachment count
transformation count
consumer-terminal count
frontiers
missing obligation IDs
unexpected obligation IDs
determinism hash
elapsed time
payload size
```

The script should exit nonzero when a named positive obligation is missing.

### Priority 3: Separate discovery from acceptance

Keep the G01 through G18 matrix. Move it out of production discovery policy.

Build a generic candidate discovery pass from compiler-backed facts. Then apply
the fixture matrix only in diagnostics and tests.

The product query should return all exact candidates that fit supported transfer
functions. It should not need soccer component names or action names.

### Priority 4: Return proven subsets with explicit frontiers

Do not make one missing optional target erase all valid runtime attachments.

Use this separation:

```text
runtime result:
  every exact proven attachment
  + every exact frontier

fixture acceptance:
  require G01 through G18
```

This keeps the product informative while preserving strict closure tests.

### Priority 5: Measure and bound performance

Record these values for the soccer fixture:

- cold selected-source query time;
- warm query time;
- materialized evidence count;
- carrier states visited;
- payload bytes;
- validator time; and
- browser time to field inventory.

Add stage timing to the maintained diagnostic runner.

### Priority 6: Refactor the largest modules

Do this after regression tests exist.

Likely extraction boundaries are:

- carrier graph indexing versus search;
- generic candidate discovery versus target filtering;
- transfer assembly versus transfer verification;
- graph state synchronization versus graph rendering; and
- direct consumers versus component consumers.

Do not mix new transfer behavior into this cleanup.

### Priority 7: Update the documents

After review:

- mark the ledger plan as implemented;
- add the final commit and browser result;
- link the first retrospective to this final retrospective;
- record the fixture-specific policy limit;
- record the deferred test decision; and
- decide which plan documents should be committed.

### Priority 8: Define the next supported transform set

Do not start with “support more JavaScript.”

Choose one real fixture and one bounded set. Possible next transforms include:

- resource and context packing without fixture-specific carrier rules;
- `.filter` and `.map` collection transforms;
- destructuring;
- object construction and spread;
- explicit field renames;
- derived scalar values;
- more Solid control-flow forms; and
- broader component return shapes.

Each new transform needs a positive example and a clear fail-closed case.

## Recommended process for the next analyzer feature

### 1. Write two contracts

Write a product contract and an engine contract.

The product contract states what the user sees on one real fixture.

The engine contract states which language transforms are supported generically.

Do not let a fixture-specific target list become the engine specification.

### 2. Baseline the real journey before planning

Use the normal controls. Record the visible result, API result, first proof stop,
runtime, and screenshot.

### 3. Make Task 1 vertical

Task 1 must cross collector, query, DTO, UI, and normal activation for one named
relationship.

It must end with one visible browser proof.

### 4. Review exactness before breadth

For the first proof shape, verify:

- exact source;
- exact field;
- exact occurrence;
- exact consumer;
- exact terminal; and
- one ambiguity mutation.

Only then add more consumers of the same shape.

Repeat the review when the proof shape changes.

### 5. Keep acceptance outside runtime policy

The runtime should discover supported facts. The acceptance matrix should check
named fixture results.

### 6. Use fresh services for browser gates

Record the analyzer commit, frontend commit, ports, project root, and asset mode.

Do not accept a browser result from a service that another worker is changing.

### 7. Give verifiers the original job

The verifier should receive the user action and visible result. It should not
receive only the latest bug description.

### 8. Reduce orchestration narration

Send updates for:

- a new worker group;
- a passed or failed gate;
- a new root cause;
- an escalation; or
- a completed milestone.

Do not send one update for each unchanged wait.

### 9. Preserve failed gates as artifacts

When a proof fails, save a small structured result with:

- obligation ID;
- last accepted transform;
- rejected transform;
- exact identities;
- reason;
- elapsed time; and
- relevant source locations.

This reduces repeated discovery after compaction or escalation.

## Final assessment

The thread did eventually achieve the user-visible goal for the declared soccer
fixture. The final UI is useful. The final proof is substantially stricter than
the earlier implementation. The result deserves to remain.

The thread also paid an unusually high price for that result. The largest cause
was not model speed. It was an initial mismatch between the stated project cut
line and the real positive fixture, followed by completion gates that allowed
zero useful output.

The outcome contract fixed the definition of done. It did not reduce the proof
surface. Once G01 through G18 were mandatory, the implementation had to resolve
every hidden identity and integration seam that earlier checks ignored.

The best next move is consolidation, not another broad feature sprint.

First, preserve the current behavior with approved tests and one maintained
acceptance runner. Then separate generic discovery from the soccer acceptance
matrix. After that, extend the supported transformation set one real fixture at
a time.

That sequence keeps the useful result while preventing the next field-flow
feature from becoming another multi-day proof rescue.
