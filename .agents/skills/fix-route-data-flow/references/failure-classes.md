# Route Data-Flow Failure Classes

Use the snapshot classifier as the primary routing signal. These are
investigation starting points, not permission to bridge uncertain data flow.

| Class | Decisive evidence | Inspect first |
|---|---|---|
| `ROUTE_NOT_FOUND` | Copied route key/path cannot be reconciled | `route-discovery.ts`, selection payload |
| `SOURCE_NOT_DISCOVERED` | Route exists but persisted source is absent | source-call classification and route-data operation creation |
| `RETURN_HANDOFF_MISSING` | Source exists and `handoffProven` is false | `route-data-resource.ts` |
| `SOURCE_PROJECTION_MISSING` | Handoff is proven but exact source paths are zero | `api/projections/route-data.ts` |
| `GRAPH_TRUNCATED` | Exhaustive graph hit a path/depth budget | `route-data-trajectories.ts` budgets and branching |
| `PROP_BRIDGE_MISSING` | Expected component is absent and no supported prop bridge reaches it | prop roots, callable props, component identity |
| `CONTEXT_BRIDGE_MISSING` | Upstream components exist but an expected context consumer is absent | provider/hook channel recognition |
| `CONTEXT_MEMBER_OVERMATCH` | A rejected or unrelated consumer is selected | context member lineage and field reads |
| `API_PROOF_COMPLETE` | Expected API path is exact and precise | proceed to live UI verification |
| `UI_PROJECTION_MISMATCH` | API proof is correct but visible highlighting differs | topology source lens, component model, URL/state restoration |

## Bounded Adapter Rules

- Match TypeScript syntax kinds and resolved symbols, not text similarity alone.
- Treat wrappers as transparent only when their value-preserving behavior is
  explicit, such as supported parentheses, assertions, `await`, or specifically
  reviewed Promise methods.
- Require unambiguous declaration or boundary identity before stitching.
- Carry the selected prop/context member across bridges.
- Preserve conservative failure when several sources share one consumer and the
  analyzer cannot distinguish them.
- Never fabricate a connection from semantic stage, filename proximity,
  component containment, or import reachability.

## Common Historical Misses

- Resource fetchers hidden behind helpers or concise returns.
- Logical, conditional, and Promise recovery wrappers around source calls.
- Values pushed into a collection that is returned later.
- Shorthand object properties resolving to the property symbol instead of the
  value symbol.
- Accessor-wrapped props and bound object accessors.
- Callable prop reads such as `props.value()`.
- Context provider-to-hook continuation.
- Context-channel matches that ignore which member actually flows.
