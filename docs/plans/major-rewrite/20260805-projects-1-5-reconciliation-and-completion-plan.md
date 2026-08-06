# Projects 1–5 Reconciliation and Completion Plan

**Date:** 2026-08-05  
**Status:** Proposed completion sequence  
**Related plans:** [Project map](execution-plans/README.md), [Project 3](execution-plans/03-honest-route-totality.md), [Project 4](execution-plans/04-route-investigation-workspace.md), and [Project 5](execution-plans/05-route-cutover-and-legacy-removal.md)

## Purpose

The first four projects produced a strong static-analysis foundation and a much
better route graph. The remaining work should polish that product without
removing useful questions from the current view.

This document reconciles the original Projects 1–5 with the current dirty work
tree. It identifies completed work, missing commitments, cutover requirements,
and the recommended completion sequence.

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
| 3 — Honest route totality | Visual and occurrence work complete; semantic closure incomplete | Add context continuity, audit origin coverage, and repair wrapper safety. |
| 4 — Route investigation workspace | Mostly implemented | Restore field parity, unify source selection, finish context display, improve performance, and pass the final gate. |
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

The following commitments remain incomplete.

### 3.1 Add context provider-to-consumer continuity

The new evidence model does not represent application context as a first-class
handoff. A Provider can appear in the render hierarchy, but the graph cannot
reliably identify its consumers.

Add an exact context evidence chain:

```text
context declaration
  → provider occurrence
  → provided value
  → context read
  → consuming component occurrence
  → render terminal
```

Required rules:

- Resolve the context declaration through compiler identity.
- Keep each Provider occurrence separate.
- Join a consumer only to a proven reachable Provider occurrence.
- Preserve nested Provider shadowing.
- Do not join through matching context names.
- Preserve member identity only when evidence proves it.
- Emit gaps for ambiguous providers, dynamic identities, and unsupported wrappers.

Required product behavior:

- Select a context to reveal its Provider and consumers.
- Select a component to list the contexts it consumes.
- Show the exact Provider, read, and consumer code locations.
- Keep unknown member lineage explicit.

### 3.2 Repair transparent-wrapper safety

The original plan requires semantic evidence before a wrapper can disappear.
The current projection cannot fully apply that policy without context evidence.

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

The inspector must explain why each wrapper was hidden or retained.

### 3.3 Audit route origin coverage

The Project 3 plan names several origin families. The implementation does not
yet demonstrate every family as a first-class route origin.

Create a maintained coverage ledger for:

- filesystem;
- database;
- network, fetch, and resources;
- URL and route parameters;
- environment;
- application context;
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
- context-reading wrappers stay visible when they own behavior;
- the origin coverage ledger has no silent category; and
- existing route occurrence and bridge counts do not gain false connections.

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

### 4.3 Integrate context investigation

Project the context evidence from Project 3 into the route workspace.

Default display:

- Keep context Providers as compact boundary marks.
- Keep consumer connections quiet until selection.
- Avoid drawing every context member at low zoom.

Selected display:

- Emphasize Provider-to-consumer connections.
- Show every proven consuming component occurrence.
- Show proven member reads as field labels.
- Keep unproven consumers and members as frontiers.
- Support forward and backward traversal through the context handoff.

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

### Step 0 — Protect the current work

The rewrite currently spans a large dirty work tree. Before new implementation:

1. Inventory tracked and untracked files.
2. Separate unrelated user work from rewrite work.
3. Run `pnpm lint` and `pnpm typecheck`.
4. Review the resulting diff by subsystem.
5. Create a coherent checkpoint commit when authorized.

Do not begin legacy deletion while the rewrite exists only as one dirty state.

### Step 1 — Freeze the question-parity baseline

Record the useful questions answered by the current topology and trajectory
views. Include field, context, resource, transform, source, and terminal use.

This baseline prevents later deletion from redefining parity.

### Step 2 — Close Project 3 semantics

Implement context identity and Provider-to-consumer handoffs. Then repair
transparent-wrapper safety and complete the origin coverage ledger.

Verify the semantics before adding new UI labels.

### Step 3 — Complete Project 4 parity

Add field-to-component projection. Unify source selection. Add context display
and finish proof-oriented code navigation.

Use the compact Totality graph as the primary surface.

### Step 4 — Complete state and performance work

Finish refresh reconciliation. Reduce ordinary payload and cold-route costs.
Verify cancellation, route switching, and stable camera behavior.

### Step 5 — Run the Project 4 product gate

Run clean-room production-style reviews on Pluck and one large repository.
Repair any failed primary journey before cutover.

### Step 6 — Promote the new route contracts

Remove the legacy flow dependency from Totality loading. Make the new inventory
and slice DTOs authoritative.

### Step 7 — Make Totality the default

Retain a temporary comparison route. Use it only to discover missing product
questions and regressions.

### Step 8 — Approve and add focused tests

Request test-work approval. Add coverage for the semantic and state risks
listed above.

### Step 9 — Remove legacy paths

Delete fallbacks, duplicate projections, old renderers, and obsolete contracts
in bounded steps. Verify each ownership boundary.

### Step 10 — Run final verification and product review

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

### Context requirements lack one explicit owner

The plans require context traversal, but no execution milestone owns the full
Provider-to-consumer implementation.

This plan assigns evidence semantics to Project 3 and product interaction to
Project 4.

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

Route Totality can become the default because its graph and static checks are
strong. The old view can then be removed before field and context parity exists.

Users would gain honest occurrences, proof, and gaps. They would lose direct
answers about fields and contexts. Large repositories could also remain slow.

The missing behavior would become harder to recover after its reference
implementation disappears.
