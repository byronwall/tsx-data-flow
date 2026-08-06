# Project 2 — Scope-Neutral Proof Pack

## Outcome

Prove that the new evidence and slice path can explain several application forms
without creating one trajectory engine per adapter.

This project uses small examples to force the core seam. It does not attempt to
give every example the full route user experience.

## Current execution status

Status: Complete. Milestones 1–4 are complete. Project 3 is next.

| Milestone | Status | Evidence or remaining work |
| --- | --- | --- |
| Milestone 1 — Implementation and independent verification | Complete | All five fixtures passed independent verification. Owners repaired Solid external-body overclaim/loading terminal, CLI citations/stderr/multiplicity, HTTP safe POST path/log terminal, shared field-role matrices, and the full-stack loading terminal. Fixture TypeScript/ESLint and safe commands passed. |
| Milestone 2 — Scope and slice seam | Complete | Independent acceptance PASS. Solid is 344/658/6/35/2 with no truncation. Node CLI is 364/743/14/7/77 with no truncation. The indexed-facts/lazy-relation decision remains planned work before Pluck-scale use. |
| Milestone 3 — CLI and service scopes | Complete | HTTP, serverless, Solid regression, and Node CLI final slices passed independent acceptance. |
| Milestone 4 — Exact full-stack bridge | Complete | Final full-stack CLI slice passed independent acceptance. Project 3 is next. |

### Active worker wave

| Worker | Ownership | Role |
| --- | --- | --- |
| 🧭 17 | `examples/solid-route/**` | Fixture implementation |
| 🧭 18 | `examples/node-cli/**` | Fixture implementation |
| 🧭 19 | Shared seam | Read-only shared-seam study |
| 🧭 29 | Milestone 2 independent verification | Acceptance PASS |
| 🧭 30 | Eager/lazy performance spike | Decision complete |

Project 1 remains complete. Its refresh restoration follow-up remains assigned
to Project 4. No tests were run or changed.

### Fixture implementation snapshot

Implementation and independent verification are complete for all five fixtures.

| Fixture | Implementation evidence | Current analyzer or verification note |
| --- | --- | --- |
| `examples/solid-route` | README, handwritten evidence ledger, repeatable command, and fixture-scoped static checks are present. | The current render result is useful. The initial worker reported 4 sinks. A later verifier observed 19 findings across route and component files with no unknown edges. |
| `examples/solid-full-stack` | README, handwritten evidence ledger, repeatable command, and fixture-scoped static checks are present. | The analyzer reports 6 sources, 8 sinks, 29 nodes, 21 edges, 0 unknown edges, and 4 path families. The exact static `GET /api/records` bridge is in the ledger, but the current analyzer does not join HTTP boundaries. One unmatched telemetry request stays external. |
| `examples/node-cli` | README, handwritten evidence ledger, repeatable command, and fixture-scoped static checks are present. | Run and smoke checks work. The current render analyzer result is empty because the analyzer is route/JSX-only. This is a documented limitation, not evidence-slice success. |
| `examples/http-service` | README, handwritten evidence ledger, repeatable command, and fixture-scoped static checks are present. | Run and smoke checks work. The current render analyzer result is empty because the analyzer is route/JSX-only. This is a documented limitation, not evidence-slice success. |
| `examples/serverless-handler` | README, handwritten evidence ledger, repeatable command, and fixture-scoped static checks are present. | Run and smoke checks work. The current render analyzer result is empty because the analyzer is route/JSX-only. This is a documented limitation, not evidence-slice success. |

All five fixture verification results are PASS. No tests were run or changed.

### Milestone 2 implementation snapshot

The initial Solid route and Node CLI seam implementation is complete. The
repaired implementation includes `program-evidence.ts` at 568 lines plus
`program-evidence-support.ts`. It detects environment, argv, stdin, `exitCode`,
stderr, file IO, and explicit external-response gaps.

`evidence-slice.ts` is 466 lines. `evidence-slice-support.ts` is 512 lines and
`evidence-slice-coverage.ts` is 134 lines. They provide exact parameter-role
mapping, deterministic role-distance priority, and runtime gap preservation.

Adapter-local defaults are bounded at `maxElements: 512` and
`maxRelations: 1024`. Both bounded CLI smoke runs passed. Scoped TypeScript,
ESLint, and diff checks passed in worker checks. Stderr is not stdout.

Worker 🧭 29 completed independent Milestone 2 acceptance with PASS. Worker 🧭 30
completed the eager/lazy performance decision. The indexed-facts/lazy-relation
optimization remains planned work before Pluck-scale use.

### Milestone 2 acceptance snapshot

Status: Complete. Independent acceptance: PASS.

Passed checks:

- The schema has exactly six keys.
- IDs are stable, source-based, and contain no route or scope tokens.
- No duplicate IDs or invalid relation endpoints remain.
- Stable IDs contain no route or scope IDs. Duplicate IDs: 0. Invalid relation
  endpoints: 0. Invalid proof: 0.
- Proof records have source backing.
- No fetch or resource bridge is invented.
- Adapters provide seeds only.
- Direction, boundary, terminal, and budget diagnostics pass.
- Required origin and terminal role distributions and policy checks pass.
- `pnpm lint` and `pnpm typecheck` pass.

The following table records the pre-repair acceptance baseline:

| Scope | Elements | Relations | Origins | Terminals | Gaps | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Solid wide | 344 | 658 | 6 | 35 | 0 | Complete |
| CLI wide | 361 | 736 | 2 | 6 | 77 | No truncation |
| Solid default | 128 | 192 | 6 | 16 | 60 | Truncated |
| CLI default | 128 | 256 | 1 | 2 | 90 | Truncated |

Final repaired default results:

| Scope | Elements | Relations | Origins | Terminals | Gaps | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Solid default | 344 | 658 | 6 (resource 2, fetch 2, network 2) | 35 (render 22, component 7) | 2 external-code | No truncation |
| CLI default | 364 | 743 | 14 (argument 6, environment 4, filesystem 1, cwd 3) | 7 (stdout 1, file-write 1, exit 1, side-effect 4) | 77 honest | No truncation |

The repair adds environment, argv, stdin, `exitCode`, stderr, file IO, and
explicit external-response gaps. It adds exact parameter-role mapping,
deterministic role-distance priority, and runtime gap preservation. Stderr is
not stdout.

The previous acceptance defects were repaired:

- CLI lacks environment and exit roles.
- Stderr is misclassified as stdout.
- Solid lacks explicit runtime or external async gaps.
- Default traversal reaches caps before required CLI terminals.

The eager Pluck collection has not returned successfully. Read-only prep studies
remain preparation only and do not start Milestones 3–4. Tests, build, and
verify were not run.

### Performance-spike decision

Decision: use indexed facts with lazy relation expansion. Keep the current eager
collector only as a small-fixture fallback. The current bounded query runs after
full eager collection, so it does not solve Pluck scale.

| Workload | Measurement |
| --- | --- |
| Five fixtures | 0.80–0.91s wall; 267–391 elements; 426–775 relations; about 318–340 MiB end RSS. |
| Pluck TypeScript program load | 616 project files; 3,712 total files; 3.43s; about 1,010 MiB RSS. |
| Full Pluck evidence collection | Did not finish within 150s and was stopped. |
| Pluck store subset | 53 files; 25,036 elements; 48,851 relations; 68 gaps; 16.4s; about 1,660 MiB RSS. |
| Pluck viewer subset | 127 files; 38,881 elements; 79,220 relations; 56 gaps; 68.5s; at least 1,647 MiB heap. |
| Default bounded Solid and CLI slices | About 204–231KB and about 2ms after eager collection; both hit caps. |

Next bounded optimization: keep compact declaration facts eager, then
materialize `contains`, `references`, and other relations lazily from the
selected seed. This optimization is planned, not implemented. It is required
before Pluck-scale use. Project 2 is complete, but this optimization remains
planned before Pluck-scale use.

### Milestone 3 acceptance snapshot

Status: Complete. Independent acceptance: PASS.

| Scope | Elements | Relations | Origins | Terminals | Gaps | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| HTTP | 335 | 674 | 7 | 7 | 68 | No truncation or budget exhaustion |
| Serverless | 164 | 322 | 2 | 7 | 26 | No truncation or budget exhaustion |
| Solid regression | 344 | 658 | 6 | 35 | 2 | No truncation or budget exhaustion |
| Node CLI | 364 | 743 | 14 | 7 | 77 | No truncation or budget exhaustion |

The exact six-key schema, required origin and terminal role distributions,
stable IDs, registration and nested-entry proofs, policy checks, adapter-only
seeds and defaults, stderr separation, and honest gaps passed. The repaired
serverless evidence ledger is recorded. The EOF whitespace follow-up is
recorded, and EOF checks passed.

`pnpm lint`, `pnpm typecheck`, and diff checks passed. Tests, builds, and verify
were not run. Project 3 is next.

### Milestone 4 acceptance snapshot

Status: Complete. Independent acceptance: PASS.

The final full-stack CLI slice contains 269 elements, 491 relations, 9 origins,
23 terminals, and 1 gap. It uses the exact six-key schema with no truncation or
budget exhaustion.

The stable `RecordsPage` seed is `13zzlo3`, backed by
`program-element:14lb9j5` through the `solid-full-stack` adapter. The matched
records gap is removed. Telemetry remains the sole external gap.

The accepted bridge is `program-relation:anvqd6`: `server.ts:30`
`response.end(body)` (`HTTP-response`) connects to `client.tsx:20`
`createResource` (`resource-input`). Its proof includes client fetch `:5`,
server normalization `:35–38`, the GET/path guard `:40`, the resolved handler
declaration/call `:24`/`:41`, response `:30`, and resource `:20`.

A false-positive repair now requires the handler request-origin parameter. Eight
negative variants returned zero bridges and honest external gaps.

`pnpm lint`, `pnpm typecheck`, diff, and scoped whitespace/EOF checks passed.
Tests, builds, and verify were not run. Unrelated pre-existing whitespace was
outside the dirty acceptance scope.

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
