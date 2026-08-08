# Projects 1–5 Reconciliation and Completion Plan

**Original date:** 2026-08-05

**Reconciled:** 2026-08-07

**Status:** Context foundation implemented; Projects 3–5 remain open

**Related plans:** [Project map](execution-plans/README.md), [Project 3](execution-plans/03-honest-route-totality.md), [Project 4](execution-plans/04-route-investigation-workspace.md), and [Project 5](execution-plans/05-route-cutover-and-legacy-removal.md)

## Purpose

The first four projects produced a strong static-analysis foundation and a much
better route graph. The remaining work should polish that product without
removing useful questions from the current view.

This document reconciles the original Projects 1–5 with the current branch. It
includes the context work in commits `b79a491` and `c9cb265`. It identifies
completed work, missing commitments, cutover requirements, and the recommended
completion sequence.

## Reconciliation basis

The recent context work adds these capabilities:

- compiler-identified context declarations;
- distinct Provider occurrences and provided values;
- exact context reads and consuming component occurrences;
- nearest reachable Provider selection;
- default-value continuity;
- nested Provider shadowing barriers;
- bounded member-path evidence;
- explicit gaps for unsupported or ambiguous evidence;
- cross-context relay records;
- strict transport validation; and
- context marks, links, filters, proof, and locations in Route Totality.

Commit `c9cb265` also repairs branch reachability for Providers inside wrapped
render structures.

These commits contain implementation work. They do not contain regression tests
or recorded product-gate evidence. This plan marks a gate complete only when its
acceptance evidence exists.

## Outstanding work summary

The context evidence and product integration gaps are now closed. The following
work still blocks Projects 3–5:

1. Make wrapper hiding consult context reads and other semantic behavior.
2. Complete the route-origin coverage ledger.
3. Add general origin field-to-component parity.
4. Unify source selection with Route Totality.
5. Finish non-context proof navigation and refresh restoration.
6. Meet the performance targets after measuring the added context work.
7. Run the remaining accessibility and production-style gates.
8. Complete all Project 5 contract, cutover, deletion, and approved test work.

## Product decisions that govern this plan

The following defaults guide the proposed sequence. Change them before
implementation if they do not match the intended product.

1. The primary job is to follow an origin through fields, contexts, component
   occurrences, and terminals.
2. The current view remains available until the new view has question parity.
3. Visual parity is not required. The new view can answer questions differently.
4. A 25–30 second ordinary cold route load is not an acceptable final target.
5. Context providers remain compact in the overview. Selection reveals consumers.
6. Refresh preserves route, renderer, selection, isolation, and useful camera state.
7. Projects 1–5 cut over the route product. Other scope UIs can remain later work.
8. Approved regression tests become part of Project 5 before legacy deletion.

## Reconciled status

| Project | Reconciled status | Remaining responsibility |
| --- | --- | --- |
| 1 — First proven route slice | Complete | Preserve the exact `readFile` scenario as regression evidence. |
| 2 — Scope-neutral proof pack | Complete foundation | Prove representative large-project use through later product gates. |
| 3 — Honest route totality | Context semantic gates passed; other semantic closure remains | Integrate wrapper safety and audit origin coverage. |
| 4 — Route investigation workspace | Context investigation works; other product parity remains | Restore field parity, unify source selection, improve performance, and pass the final gate. |
| 5 — Route cutover and legacy removal | Not started | Promote new contracts, prove parity, remove legacy paths, and complete approved verification. |

## What stays complete

### Project 1 — First proven route slice

Project 1 proved the critical vertical slice:

- one exact source occurrence;
- one proven origin-to-terminal chain;
- source-backed proof for every relationship;
- explicit gaps for missing proof;
- component occurrence identity;
- safe local wrapper splicing; and
- a visible proof graph and inspector.

Do not reopen Project 1 for new product work. Keep its final `readFile` path as
a required regression scenario during Project 5.

### Project 2 — Scope-neutral proof pack

Project 2 proved the shared evidence architecture:

- one scope-neutral evidence vocabulary;
- route, CLI, HTTP, and serverless seeds;
- stable source-based identities;
- bounded slices with coverage and gaps;
- exact client-to-server HTTP bridging; and
- indexed relation expansion.

Do not redesign this seam during the route finish. Remaining scale concerns
belong to the Project 4 and Project 5 product gates.

## Project 3 semantic closure

Project 3 produced the strongest parts of the rewrite. Preserve these parts:

- definition and occurrence separation;
- caller-owned and definition-owned child identity;
- repeated and conditional occurrence markers;
- route-wide origins and terminals;
- explicit omissions and partial states;
- compact route projection with optional evidence detail; and
- deterministic layout and inspection.

The following commitments remain incomplete or need acceptance evidence.

### 3.1 Finish and prove context provider-to-consumer continuity

The context evidence model now represents this first-class chain:

```text
context declaration
  → provider occurrence
  → provided value
  → context read
  → consuming component occurrence
  → render terminal
```

Implemented rules:

- Context declarations use compiler identity.
- Each Provider occurrence has its own identity and provided value.
- Consumers join only to the nearest proven reachable Provider.
- An incomplete inner Provider blocks an unsafe join to an outer Provider.
- Context names do not create joins.
- Member paths require bounded source evidence.
- Ambiguous Providers, dynamic identities, and unsupported wrappers create gaps.
- Default values and cross-context relays remain explicit.

Completed semantic evidence:

- One Provider reaches two consumer occurrences through two proven links.
- Two nested Providers reach only their own consumer occurrences.
- Ambiguous Providers produce no link and one explicit gap.
- A dynamic Provider shape produces no link and one explicit stop gap.
- Each tested consumer owns one terminal-linked continuity link.
- Repeated analysis returns identical counts and stable IDs.

The focused regression suite has six passing tests in
`test/route-context-continuity.test.ts`. Commit `b724500` records this evidence.

Completed product behavior:

- Component occurrence selection lists its consumed contexts.
- Context declarations, roles, and links use the main selection contract.
- Context links support forward and backward emphasis.
- Partial context endpoints remain explicit frontiers.
- Context proof opens in the trace-oriented source surface.
- Valid context focus restores from URL state and refresh.
- Route changes clear stale context focus.

Commits `28f0ed1`, `0fd1027`, `3d7aee5`, `c414e69`, and `25116b4` implement
the product path. A clean-room browser pass confirmed the core journey on
`examples/bad-ish-solid` and `/roster`.

### 3.2 Repair transparent-wrapper safety

The original plan requires semantic evidence before a wrapper can disappear.
Context evidence now exists, but the hiding projection does not consult it.

Before hiding a wrapper, check:

- child forwarding;
- data loading;
- context reads;
- domain transforms;
- important local state;
- conditional render ownership; and
- caller-owned versus definition-owned children.

A configured folder or component family can suggest a candidate. It cannot
prove that the occurrence is transparent.

The inspector must explain why each wrapper was hidden or retained. Add focused
evidence that a context-reading wrapper stays visible.

### 3.3 Audit route origin coverage

The Project 3 plan names several origin families. The implementation does not
yet demonstrate every family as a first-class route origin.

Create a maintained coverage ledger for:

- filesystem;
- database;
- network, fetch, and resources;
- URL and route parameters;
- environment;
- application context, now supported as a handoff but not yet classified as an origin;
- global state or stores; and
- browser storage.

For each family, record one of these states:

- proven and supported;
- unsupported with an explicit gap; or
- intentionally outside the route product.

No origin family can remain silently absent.

### Project 3 closure gate

Project 3 semantic closure passes when:

- one real context Provider reaches more than one consumer occurrence;
- nested or ambiguous Providers do not create false joins;
- wrapped Provider branches reach only their proven consumers;
- context-reading wrappers stay visible when they own behavior;
- the origin coverage ledger has no silent category; and
- existing route occurrence and bridge counts do not gain false connections.

Current gate status: context evidence passed. Project 3 still needs wrapper
safety and the origin coverage ledger before full semantic closure.

## Project 4 completion

Project 4 already provides selection, traversal, isolation, code excerpts,
findings, URL state, cancellation, and compact display. Complete it in the
following order.

### 4.1 Restore basic field-to-component parity

The current topology view can show which proven fields pass through each
component. Route Totality does not yet provide that summary.

Add a bounded field projection:

```text
selected origin
  → proven field or property reads
  → proven data relations
  → component occurrences
  → render terminals
```

Required behavior:

- Show field labels only after source identity is proven.
- Attach fields to component occurrences, not shared definitions.
- List proven fields in the component inspector.
- Keep consumer-level handoffs separate from field-level lineage.
- Do not infer lineage from equal field names.
- Show no field label when identity is lost.

This work does not implement full Project 6 type flow. Defer field renames,
packing history, derivation, and complete shape transformations.

### 4.2 Unify source selection

The current source picker does not control the Route Totality renderer. Users
must instead find and select an origin inside the graph.

Choose one source-selection model:

- make the existing picker select its exact Totality origin; or
- replace it with a Totality-native origin picker.

The selected source must control emphasis, inspector state, isolation, and URL
state through one identity.

Remove controls that appear active but do not change Totality.

### 4.3 Integrate context investigation — complete for cutover parity

The context panel and graph overlay now project Project 3 evidence. The panel
supports status filters, display modes, context focus, proof, and locations.

Implemented display:

- Dense contexts use compact Provider and consumer marks.
- Context focus reveals mapped Provider-to-consumer links.
- Focused links show proven member paths.
- Partial and unsupported records remain explicit.

Completed integration:

- Graph component selection lists its consumed contexts.
- Context marks and links use the main selection contract.
- Context links participate in forward and backward graph adjacency.
- Context frontiers participate in emphasis and isolation behavior.
- Context focus persists through URL state and refresh.
- Context filter and display mode remain local by design.
- A real-route browser pass verified selection, traversal, proof, and refresh.

Remaining accessibility follow-up:

- Improve direct Provider and consumer control labels.
- Repair keyboard tab movement into Route Totality context controls.

These accessibility issues belong to the remaining Project 4 gate. They do not
block the context question-parity path.

### 4.4 Finish trace-oriented code inspection

Exact excerpts already work. Confirm that multi-file navigation follows the
selected proof sequence.

Required behavior:

- Open the exact selected span.
- Move through related evidence in stable proof order.
- Show the containing function.
- Offer full-file navigation.
- Close the source surface without losing graph state or focus.
- Keep full source text outside the graph DTO and URL.

### 4.5 Finish local state restoration

Persist only useful investigation state:

- route or scope;
- projection or renderer;
- selected source, node, or edge;
- emphasis direction;
- isolation;
- useful camera state; and
- explicit evidence disclosure when appropriate.

Context focus now uses the same URL reconciliation policy. Context filter and
display mode remain local because they are lightweight display preferences.

Do not persist hover, temporary menus, loading state, or stale errors.

After analysis changes, retain the nearest valid scope and clear invalid child
state. Do not show the default renderer before restoration finishes.

### 4.6 Meet an explicit performance gate

The current large-project evidence remains useful, but cold work is too slow
and some payloads are too large.

Use these initial targets unless product review selects different limits:

| Measure | Initial target |
| --- | ---: |
| Large repository workspace cold analysis | Under 15 seconds |
| Ordinary selected route after workspace analysis | Under 5 seconds |
| Warm selected route | Under 500 milliseconds |
| Ordinary default route payload | Under 5 MB |
| Camera or selection server requests | Zero |
| Abandoned request behavior | Cancels promptly |
| Repeated route switching | No sustained memory growth |

Exceptional routes can exceed the target when the UI names the cost, remains
responsive, and supports cancellation.

Measure analysis time, slice time, projection time, layout time, payload size,
peak memory, and visible mark counts separately.

Repeat these measurements after context analysis. The recent commits add a
program scan, value summaries, continuity projection, and browser indexing.
No updated large-repository measurement is recorded yet.

### 4.7 Run the Project 4 decision gate

Use Pluck and one large external repository. Give the reviewer no source-code
walkthrough.

The reviewer must be able to:

- identify major origins;
- select one origin;
- see proven fields through component occurrences;
- identify context crossings and consumers;
- reach every proven terminal;
- inspect exact code and proof;
- explain visible gaps;
- restore the full route; and
- refresh without losing the useful investigation.

Run this gate in the final production-style runtime. Development-browser checks
do not replace this gate.

## Project 5 cutover and legacy removal

Do not start deletion until the Project 4 decision gate passes.

### 5.1 Create a question-parity ledger

Compare the current and new views against user questions, not screenshots.

The ledger must include:

- Which source feeds this route?
- Which fields are read by each component occurrence?
- Which context connects these components?
- Which components consume this context?
- Which resource owns a handoff?
- Which operations transform the value?
- Which terminals receive the value?
- Where does proof stop?
- Which findings attach to this evidence?
- Which exact code proves the claim?

For each question, record:

- the current answer path;
- the new answer path;
- known limitations;
- acceptance evidence; and
- the retirement decision for the old path.

The new view can use another interaction. It cannot silently remove a valuable
question.

### 5.2 Promote the new contracts

Route Totality currently arrives inside a legacy route-and-trajectory detail
request. The canonical route product should use the scope-neutral inventory and
slice contracts directly.

Required changes:

- Make the new route inventory authoritative.
- Load one selected route slice without a legacy flow requirement.
- Keep server and browser contract validation strict.
- Keep generation and cancellation semantics.
- Remove browser reconstruction of source and component membership.
- Keep layout and interaction in the browser.

### 5.3 Make Route Totality the default

After parity approval:

1. Make Route Totality the default route renderer.
2. Keep the old view behind an explicit comparison control.
3. Use the product on real repositories.
4. Record any missing question or regression.
5. Remove the comparison control only after final approval.

### 5.4 Remove legacy implementation in bounded steps

Remove one ownership area at a time:

1. Broad source fallbacks.
2. Browser-created source and component membership.
3. Definition-merged route topology.
4. Evidence-card route membership.
5. Duplicate route DTOs and projections.
6. Obsolete renderer state and URL compatibility code.
7. Separate component structure product code.

After each step, run static checks and the approved focused verification. Do
not mix broad deletion with a new semantic capability.

### 5.5 Add approved regression coverage

Ask for test approval after semantic parity is complete. Prioritize these risks:

- exact source occurrence membership;
- context Provider and consumer identity;
- nested Provider shadowing;
- field-to-component projection;
- component occurrence isolation;
- transparent-wrapper safety;
- forward and backward traversal;
- gap and omission honesty;
- refresh reconciliation;
- dynamic route identity;
- request cancellation; and
- exact client-to-server bridging.

After approval, use `pnpm verify` as the final repository gate.

### Project 5 completion gate

Project 5 passes when:

- one new evidence slice drives route claims;
- the question-parity ledger is approved;
- Route Totality is the only route data-flow product;
- no broad source or component fallback remains reachable;
- Pluck and the example pack meet their semantic checks;
- the large repository meets the accepted performance limits;
- accessibility and refresh behavior pass in production style; and
- approved regression checks pass through `pnpm verify`.

## Recommended execution sequence

### Step 0 — Protect the current work — complete

The broad rewrite and context work now have coherent checkpoint commits. The
branch was clean before this plan update. Continue to use focused commits for
later implementation. Run `pnpm lint` and `pnpm typecheck` with each change.

### Step 1 — Freeze the question-parity baseline — outstanding

Record the useful questions answered by the current topology and trajectory
views. Include field, context, resource, transform, source, and terminal use.

This baseline prevents later deletion from redefining parity.

### Step 2 — Close Project 3 semantics — in progress

Context identity, Provider-to-consumer handoffs, and their acceptance evidence
are complete. Connect this evidence to transparent-wrapper safety. Complete the
origin coverage ledger.

### Step 3 — Complete Project 4 parity — in progress

Context selection and traversal are complete. Add field-to-component projection.
Unify source selection. Finish the remaining proof navigation.

Use the compact Totality graph as the primary surface.

### Step 4 — Complete state and performance work — outstanding

Finish refresh reconciliation. Reduce ordinary payload and cold-route costs.
Verify cancellation, route switching, and stable camera behavior.

### Step 5 — Run the Project 4 product gate — outstanding

Run clean-room production-style reviews on Pluck and one large repository.
Repair any failed primary journey before cutover.

### Step 6 — Promote the new route contracts — outstanding

Remove the legacy flow dependency from Totality loading. Make the new inventory
and slice DTOs authoritative.

### Step 7 — Make Totality the default — outstanding

Retain a temporary comparison route. Use it only to discover missing product
questions and regressions.

### Step 8 — Approve and add focused tests — outstanding

Request test-work approval. Add coverage for the semantic and state risks
listed above. Context continuity has six focused tests already.

### Step 9 — Remove legacy paths — outstanding

Delete fallbacks, duplicate projections, old renderers, and obsolete contracts
in bounded steps. Verify each ownership boundary.

### Step 10 — Run final verification and product review — outstanding

Run `pnpm verify` after approved test work. Repeat the question-parity review.
Then decide whether Project 6 or another candidate provides the next value.

## Work that remains after Project 5

The following capabilities remain valid later projects. They do not block the
route cutover:

- complete type and shape transformation history;
- field rename and derivation graphs;
- finding impact paths;
- read, write, and reconcile cycles;
- runtime occurrence counts;
- whole-application atlas;
- agent work packets;
- collaborative investigation state; and
- formal shared-link compatibility.

Basic field labels and context connections are not in this list. They are
required parity work for Projects 3–5.

## Weakest parts of the original sequence

### Completion status can hide missing product parity

Several phases were marked complete after their implemented subset passed a
focused gate. The status did not always cover every original product promise.

Use the question-parity ledger to prevent this mismatch.

### Context requirements originally lacked one explicit owner

The plans require context traversal, but no execution milestone owns the full
Provider-to-consumer implementation.

This plan assigns evidence semantics to Project 3 and product interaction to
Project 4. The recent work implements the semantic foundation. Shared product
interaction remains open.

### Basic field tracing was easy to confuse with Project 6

Project 4 requires proven field labels. Project 6 expands this foundation into
full type and transformation history.

Complete basic field-to-component parity before Project 5. Keep full
transformation work after the cut line.

### Scale targets are not measurable

The word `practical` permits a slow but technically successful implementation.
Use explicit latency, payload, cancellation, and memory targets.

### Project 5 permits deletion before naming valuable behavior

The removal plan lists code paths, but it does not list every user question
those paths answer.

Approve question parity before deleting the current implementations.

## Most likely failure if the sequence is not reconciled

Route Totality can become the default because its graph and context overlay look
complete. The old view can then be removed before full field and context parity.

Users would gain honest context proof. They would still lack component-driven
context answers and traversal through context handoffs. General field answers
could also disappear. Large repositories could remain slow.

The missing behavior would become harder to recover after its reference
implementation disappears.
