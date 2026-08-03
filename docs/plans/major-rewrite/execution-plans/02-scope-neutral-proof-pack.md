# Project 2 — Scope-Neutral Proof Pack

## Outcome

Prove that the new evidence and slice path can explain several application forms
without creating one trajectory engine per adapter.

This project uses small examples to force the core seam. It does not attempt to
give every example the full route user experience.

## Milestone 1: Create the comparable example pack

Add small applications under `examples/`. Each example should use the same
domain story so their slices remain comparable.

- **Change 1 — Add five small applications**
  - Add a Solid route, Solid full-stack route, Node CLI, HTTP service, and
    serverless handler.
  - Use one flow: load records, validate, select or pack fields, present or
    return records, and perform one side effect.
  - Keep each application readable without analyzer knowledge.
- **Change 2 — Write expected evidence ledgers**
  - Record each scope entry, origin, boundary, terminal, and intentional gap.
  - Distinguish static occurrence from runtime multiplicity.
  - Record one unsupported or external connection in at least one example.
- **Change 3 — Add repeatable analysis commands**
  - Use existing CLI and report entry paths where practical.
  - Produce bounded structured output for one selected scope.
  - Avoid building a new test runner during product iteration.

### Desired end state

- Five examples exist and share one recognizable domain flow.
- Each example has a hand-written expected evidence ledger.
- A developer can run each example through a repeatable local command.
- The examples reveal route-only assumptions early.

## Milestone 2: Define the scope and slice seam

Generalize only the records proven necessary by Project 1 and the examples.

- **Change 1 — Introduce scope candidates and seeds**
  - Let adapters name entry elements, labels, and useful default boundaries.
  - Keep route IDs out of stable program evidence.
  - Keep origin and terminal roles in the slice result.
- **Change 2 — Introduce one evidence-slice query**
  - Accept a scope seed, direction, boundary policy, and terminal policy.
  - Return elements, relations, origins, terminals, gaps, and coverage.
  - Preserve Project 1 proof and occurrence identity.
- **Change 3 — Separate adapter evidence from adapter guesses**
  - Require source locations or framework configuration for discovered entries.
  - Report unsupported framework behavior as coverage, not invented graph data.

- **Spike — Decide how much program evidence must be eager**
  - Decision required: eager project graph, indexed facts, or lazy relation
    expansion.
  - Evidence to gather: analysis time and memory across the examples and Pluck.
  - Fallback: keep current general graph eager and make scope slices lazy.

### Desired end state

- One slice query serves every example.
- Origin and terminal roles depend on the selected scope.
- Adapters do not create graph identities or lineage rules.
- Project 1 remains functional through the generalized seam.

## Milestone 3: Prove CLI and service scopes

Use the shared slice query for code that has no route or component tree.

- **Change 1 — Discover one CLI command**
  - Seed from command registration or its handler.
  - Classify arguments, environment, standard input, and file reads.
  - End at standard output, exit status, writes, requests, or child processes.
- **Change 2 — Discover one HTTP scope**
  - Seed from the request handler.
  - Treat request data as an input boundary.
  - End at a response, write, message, or external effect.
- **Change 3 — Discover one serverless scope**
  - Seed from framework handler evidence.
  - Reuse the same origin, boundary, terminal, and gap vocabulary.
- **Change 4 — Compare structured outputs**
  - Confirm that all three results use the same top-level slice schema.
  - Confirm that no result requires route or JSX-only fields.

### Desired end state

- CLI, HTTP, and serverless examples produce useful evidence slices.
- Their terminal roles match the scope edge.
- No adapter owns a private traversal.
- Unsupported behavior appears in coverage or gaps.

## Milestone 4: Prove one exact full-stack bridge

Connect one client request to one in-repository handler through exact evidence.

- **Change 1 — Define acceptable bridge proof**
  - Start with static URL and method evidence or a shared resolved declaration.
  - Keep the existing HTTP bridge work where it satisfies the proof rule.
- **Change 2 — Join one full-stack path**
  - Trace server origin through response, client resource, and render terminal.
  - Keep serialization and network boundaries visible.
- **Change 3 — Preserve one unmatched request**
  - End the unmatched client at an external boundary.
  - Do not connect it to a similar handler.

### Desired end state

- One full-stack example reads as one system from server origin to pixels.
- The network boundary remains explicit.
- One unmatched request remains honestly external.
- Bridge matching uses proof, not names or type similarity.

## Project decision gate

Proceed to full route totality only if all example forms share:

- one evidence vocabulary;
- one slice query;
- one gap model;
- one proof policy;
- adapter-specific seeds and defaults only.

## Below the cut line

- Rich graph UI for non-route scopes
- Framework coverage beyond the selected examples
- Runtime execution counts
- Full write reconciliation
- Public fixture packages
- Automated tests without separate approval

