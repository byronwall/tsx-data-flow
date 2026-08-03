# Project 7 — Finding Impact on the Graph

## Outcome

Let a developer select one finding and see its cause, affected paths, and blast
radius on the evidence graph.

Findings remain optional. They do not become the default route organization.

## Milestone 1: Reveal one existing finding on one path

Start with one finding whose current evidence already names exact code and
render sinks.

- **Change 1 — Link the finding to shared evidence identity**
  - Attach it to exact operations, relations, occurrences, terminals, and code
    spans.
  - Reject name-only or field-overlap impact claims.
- **Change 2 — Add an explicit reveal action**
  - Keep the default graph unchanged.
  - Emphasize the finding path only after the user asks.
- **Change 3 — Explain cause and impact in the inspector**
  - Show the responsible evidence, affected terminals, confidence, and disproof
    condition.
  - Link every claim to code.

### Desired end state

- One finding can be revealed over a proven route path.
- The default graph remains quiet.
- The highlighted path matches the finding's exact evidence.
- The inspector explains cause, impact, and uncertainty.

## Milestone 2: Aggregate findings by shared cause

Avoid presenting one repeated upstream problem as many unrelated cards.

- **Change 1 — Define shared-cause identity**
  - Group by canonical operation, field, boundary, predicate, or state owner.
  - Preserve each affected path and terminal.
- **Change 2 — Show blast radius**
  - Report affected scopes, occurrences, terminals, and code locations.
  - Distinguish repeated call sites from repeated runtime instances.
- **Change 3 — Keep findings and transforms separate**
  - Ordinary transform evidence remains browsable fact.
  - A finding requires a violated invariant, repeated burden, or proven loss.

### Desired end state

- Repeated symptoms can appear as one investigation.
- Blast radius is based on proven paths.
- Long but coherent paths are not marked as bad.
- Every grouped finding can expand to its individual evidence.

## Milestone 3: Support finding-driven investigation

Let the user move between the finding list, graph, code, and affected scopes.

- **Change 1 — Add finding filters and markers**
  - Filter by kind, confidence, scope, or selected path.
  - Keep low-zoom markers restrained.
- **Change 2 — Preserve navigation context**
  - Open a finding from code or graph.
  - Return to the same scope, selection, and camera.
- **Change 3 — Add before-and-after review support**
  - Re-run analysis after a code change.
  - Report whether evidence disappeared, moved, or remains.
  - Avoid durable identity claims across generations without a designed
    fingerprint.

### Desired end state

- Findings guide investigation without replacing it.
- A user can move from symptom to shared cause and code.
- Reanalysis reports honest change without false durable identity.
- The graph makes impact easier to understand than evidence cards did.

## Project decision gate

Review several finding families. Continue only if the graph reveals impact more
clearly than the existing card or file presentation.

## Below the cut line

- Automatic code fixes
- Severity scoring based only on path length
- Cross-revision durable graph identities
- Team collaboration
- Linear issue creation
- Automated tests without separate approval

