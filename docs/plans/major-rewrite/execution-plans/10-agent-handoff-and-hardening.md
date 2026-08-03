# Project 10 — Agent Handoff and Product Hardening

## Outcome

Turn a selected investigation into a bounded coding-agent packet and establish
measured product safety for the capabilities chosen after route cutover.

This project packages mature evidence. It should not compensate for missing
analysis by adding prose guesses.

## Milestone 1: Export one useful investigation packet

Start with one route source or finding that has exact code and path evidence.

- **Change 1 — Define the minimal packet**
  - Include scope, selected origin or terminal, path, code locations, boundaries,
    gaps, findings, and desired invariant.
  - Include type and field evidence only when the selected capability supports it.
- **Change 2 — Export compact Markdown and structured data**
  - Keep human and agent forms aligned through one projection.
  - Avoid full source dumps and unrelated graph context.
- **Change 3 — Verify rediscovery savings**
  - Give the packet to a clean coding-agent task.
  - Record missing context, redundant material, and incorrect claims.
  - Revise the packet around observed use.

### Desired end state

- One clean agent can locate and explain the selected problem from the packet.
- Every factual claim links to analyzer evidence.
- Unknowns and gaps remain explicit.
- The packet is materially smaller than the full analysis payload.

## Milestone 2: Add reanalysis and change review

Let a completed change return to the same product question without relying on
fragile graph IDs.

- **Change 1 — Define reanalysis anchors**
  - Use source spans, compiler identities, scope identity, and explicit
    fingerprints where stable enough.
  - Keep analysis-generation IDs local.
- **Change 2 — Compare semantic outcomes**
  - Report changed origins, terminals, gaps, field lineage, or finding impact.
  - Avoid treating count changes alone as improvements.
- **Change 3 — Produce a compact verification packet**
  - State the intended invariant and observed after-state.
  - Link back to current code and evidence.

### Desired end state

- A coding change can be checked against the original investigation goal.
- Moved evidence is distinguished from removed evidence.
- Count changes do not replace semantic review.
- The verification packet remains honest across analysis generations.

## Milestone 3: Establish operational diagnostics

Make analysis limits and failures visible enough to debug without reading raw
internal graphs.

- **Change 1 — Report analysis generations and timings**
  - Track project load, evidence collection, slice query, projection, payload,
    and layout stages.
- **Change 2 — Report budgets and gaps**
  - Count exhausted declarations, opaque calls, unresolved symbols, and
    unsupported adapters by scope.
- **Change 3 — Add bounded debug exports**
  - Export the selected evidence neighborhood and decision reasons.
  - Avoid giant default debug payloads.
- **Change 4 — Add visible stale and failure recovery**
  - Explain refresh failures, stale generations, empty slices, and invalid
    selection state.
  - Provide a clear local recovery action.

### Desired end state

- Product failures can be assigned to a pipeline stage.
- Budgets never fail silently.
- Debug output stays focused on the selected scope.
- Users can recover from stale or failed analysis.

## Milestone 4: Complete approved hardening

Protect the semantic contracts that proved valuable in real use.

- **Change 1 — Rank regression risks**
  - Prioritize occurrence ownership, source membership, gap honesty, bridge
    proof, transparent projection, and selected later capabilities.
- **Change 2 — Request test-work approval**
  - Present the proposed fixture, projection, and browser checks.
  - Keep unapproved test work outside implementation scope.
- **Change 3 — Add approved regression coverage**
  - Use small language fixtures for analyzer semantics.
  - Use pure projection checks for graph reduction.
  - Use a small number of browser scenarios for primary workflows.
  - Avoid exact layout coordinates and external repository snapshots.
- **Change 4 — Run final repository verification**
  - Use `pnpm verify` after approved test work.
  - Record performance baselines and known unsupported patterns.

### Desired end state

- Mature semantic contracts have risk-ranked protection.
- Operational limits and performance are documented.
- The approved repository quality gate passes.
- Known unsupported behavior remains explicit.

## Project decision gate

The packet and hardening work must reduce future rediscovery and regression
risk. Stop if it only republishes large analyzer payloads or freezes incidental
UI behavior.

## Below the cut line

- Automatic code changes
- Automatic Linear issue creation
- Public cloud analysis
- Team collaboration
- Cross-repository identity services
- Runtime production telemetry
