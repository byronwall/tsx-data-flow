# Project 4 — Route Investigation Workspace

## Outcome

Let a developer move from the holistic route overview to one source, path,
terminal, code region, or finding without losing graph context.

The graph remains the primary surface. Detail appears progressively.

## Milestone 1: Make selection explain evidence

Turn every visible graph item into an inspectable evidence target.

- **Change 1 — Unify selection identity**
  - Select origins, occurrences, boundaries, terminals, edges, hidden paths,
    gaps, and later operations through one selection contract.
  - Keep browser selection separate from analyzer identity.
- **Change 2 — Build the fixed inspector shell**
  - Show a concise summary, code locations, proof, incoming and outgoing
    neighbors, boundaries, and gaps.
  - Link occurrences to their shared definition and other call sites.
- **Change 3 — Preserve graph state**
  - Opening and closing the inspector must not remount or relayout the graph.
  - Return focus to the selected graph item when a transient surface closes.

### Desired end state

- Every visible mark and edge can explain why it exists.
- The inspector uses exact evidence from the slice DTO.
- Selection does not change graph meaning or layout.
- A user can move between an occurrence and its definition uses.

## Milestone 2: Add source and terminal investigation

Support focused questions while retaining the total route map.

- **Change 1 — Add exact source emphasis**
  - Emphasize only occurrence paths proven for the selected origin.
  - Fade unrelated route context without removing it.
  - Show field labels only when field identity is proven.
- **Change 2 — Add backward terminal emphasis**
  - Select a terminal to show every supported contributor.
  - Keep multiple origins and control inputs distinct.
- **Change 3 — Add explicit isolation**
  - Remove unrelated context only after the user asks.
  - Retain summarized incoming and outgoing boundary stubs.
  - Restore the full route without recomputing semantic evidence.

### Desired end state

- One origin reveals every proven route terminal it reaches.
- One terminal reveals every supported contributor.
- Fading and isolation have distinct behaviors.
- Gaps remain visible in focused views.

## Milestone 3: Put code beside the graph

Reuse the strongest part of the existing file-oriented product without making
files the investigation boundary.

- **Change 1 — Add exact code excerpts**
  - Show the selected source span with nearby context.
  - Navigate previous and next evidence within the current selection.
- **Change 2 — Support trace-oriented code grouping**
  - List related snippets across files in path order or evidence order.
  - Offer containing function and full-file expansion.
- **Change 3 — Preserve browser context**
  - Open code in the inspector, drawer, or a linked code-focused surface.
  - Return to the same graph selection and viewport.
- **Change 4 — Keep source transport bounded**
  - Fetch excerpts when needed.
  - Do not place full source text into the graph DTO or URL.

### Desired end state

- A selected graph fact opens the exact related code.
- Multi-file paths no longer require manual file rediscovery.
- Full-file inspection remains available.
- Graph state survives code inspection.

## Milestone 4: Add quiet finding awareness

Make findings available without turning them into the default graph subject.

- **Change 1 — Attach findings to evidence identities**
  - Link findings to occurrences, operations, edges, types, or code spans.
  - Avoid name-only matching.
- **Change 2 — Add restrained presence markers**
  - Use a ring, color cue, or count that works at useful zoom levels.
  - Keep the full finding list in the inspector.
- **Change 3 — Open existing finding detail**
  - Reuse current finding explanations and code evidence where sound.
  - Preserve graph selection when the user opens and closes detail.

### Desired end state

- Findings do not crowd the default graph.
- A user can tell when selected code has findings.
- Finding detail links back to exact graph evidence.
- No full impact-path feature is implied yet.

## Milestone 5: Restore useful local investigation state

Retain the main local view across refresh without preserving obsolete URL
contracts.

- **Change 1 — Define the small persistence set**
  - Keep scope, selection, projection, isolation, useful camera state, and
    explicit expansions.
  - Exclude temporary hover and open-menu state.
- **Change 2 — Reconcile state after analysis changes**
  - Retain the nearest valid scope.
  - Clear invalid descendants quietly.
  - Avoid a default-view flash before state restoration.
- **Change 3 — Keep navigation history useful**
  - Use replace behavior for ordinary inspection.
  - Use history entries only for meaningful scope changes.

### Desired end state

- Refresh returns to the same useful investigation.
- Source changes clear only invalid state.
- Old route URL compatibility does not constrain the model.
- Navigation does not fill browser history with selection noise.

## Project decision gate

Run a clean investigation on the Pluck route without a code walkthrough.

Proceed only if the user can:

- understand the overview;
- select one source;
- isolate a path;
- inspect exact code;
- find related findings;
- return to the full route;
- refresh without losing the main investigation.

## Below the cut line

- Inline code inside graph nodes
- Finding impact overlays
- Shared links
- Collaborative state
- Work packet export
- Type and field transform detail
- Automated tests without separate approval

