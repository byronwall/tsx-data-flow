# Project 9 — Application Atlas

## Outcome

Give a developer a repository-level application overview that indexes useful
route, command, endpoint, handler, service, and package slices.

The atlas should summarize the same evidence. It must not become another graph
truth.

## Milestone 1: Inventory proven application scopes

Start with the scope adapters already proven by earlier projects.

- **Change 1 — Build one scope inventory**
  - List routes, commands, endpoints, and handlers with framework evidence.
  - Include useful parameters, boundary counts, origin counts, terminal counts,
    coverage, and analysis status.
- **Change 2 — Separate application and file identity**
  - Link scopes to files without using files as the application model.
  - Keep generated, framework, and opaque scopes explicit.
- **Change 3 — Open existing slices from the inventory**
  - Make every supported inventory item an entry to its evidence slice.
  - Preserve the route workspace as the strongest detailed projection.

### Desired end state

- The repository exposes its proven application entry scopes.
- Every inventory item has evidence and coverage.
- Files support navigation without defining behavior.
- Selecting a scope opens the existing slice system.

## Milestone 2: Show application-level connectivity

Aggregate exact slice relations across scopes and major runtime boundaries.

- **Change 1 — Define bounded atlas nodes**
  - Start with application, package, scope, and external system.
  - Add feature or subsystem groups only when evidence supports them.
- **Change 2 — Aggregate boundary edges**
  - Preserve direction, relation kind, count, and child evidence.
  - Keep imports distinct from data and runtime relationships.
- **Change 3 — Support expand and isolate**
  - Expand one region while retaining incoming and outgoing boundary stubs.
  - Keep the active surface near a comprehensible size through exact grouping.

### Desired end state

- A user can distinguish a client, server, CLI, full-stack app, or service set.
- Major runtime and persistence boundaries are visible.
- Aggregate edges expand to exact child relations.
- Isolation does not erase external direction.

## Milestone 3: Add scale and hierarchy without invented architecture

Support larger repositories through several honest grouping schemes.

- **Change 1 — Add known hierarchy schemes**
  - Support filesystem, package, framework, runtime, and explicit configuration.
  - Permit one entity to appear in different grouping schemes.
- **Change 2 — Add evidence-backed inferred groups cautiously**
  - Show confidence and the evidence used.
  - Never present one inferred clustering as the architecture.
- **Change 3 — Preserve totals and omissions**
  - Report collapsed node and edge counts.
  - Report unsupported adapters, budgets, and opaque regions.
- **Change 4 — Measure large-repository behavior**
  - Track analysis, aggregation, payload, and layout costs.
  - Avoid sending the complete program graph to the browser.

- **Spike — Select the first hierarchy policy**
  - Decision required: which grouping gives the fastest correct orientation.
  - Evidence to gather: wall-portfolio, Pluck, a CLI, and one large repository.
  - Fallback: use explicit package, scope, and runtime groups only.

### Desired end state

- A large repository retains a meaningful overview.
- Grouping changes aggregation level, not edge meaning.
- Confidence and omissions remain visible.
- Users can move from the atlas to an exact scope slice.

## Milestone 4: Add change-oriented orientation

Use the atlas to explain which application regions a proposed or completed
change touches.

- **Change 1 — Map changed code to evidence entities**
  - Relate changed files and symbols to scopes, boundaries, and terminals.
- **Change 2 — Show vertical and horizontal reach**
  - Distinguish one end-to-end feature path from broad supporting changes.
  - Keep this descriptive rather than prescriptive.
- **Change 3 — Link into focused investigations**
  - Open affected routes, handlers, types, or findings through existing lenses.

### Desired end state

- A developer can see which application surfaces a change affects.
- The atlas reveals narrow and broad change shapes.
- Every claim opens into shared evidence.
- No new change graph duplicates the program model.

## Project decision gate

Test whether the atlas helps an unfamiliar developer describe a repository
faster than file browsing alone.

## Below the cut line

- User-authored architecture diagrams
- Architecture conformance rules
- Runtime service discovery
- Cross-repository distributed graphs
- Collaborative annotations
- Automated tests without separate approval

