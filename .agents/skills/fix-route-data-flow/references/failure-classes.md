# Route data-flow failure classes

Use the class that matches the evidence. These classes route investigation; they
do not authorize an uncertain data-flow bridge.

## Selected-source field proof

| Class | Decisive evidence | Inspect first |
|---|---|---|
| `SOURCE_SELECTION_FAILED` | The route or source locator matches zero or multiple records | route and source inventory |
| `SELECTED_ORIGIN_UNPROVEN` | The selected source has no exact compiler evidence | source evidence record |
| `FIELD_PROOF_UNAVAILABLE` | The selected source produces an unavailable lineage result | selected-source activation and route session |
| `NO_POSITIVE_ATTACHMENTS` | The result has zero attachments or no selected field paths | ledger query and carrier continuity |
| `MISSING_OBLIGATION` | A named field-to-consumer semantic record is absent | obligation target and transformation ledger |
| `UNEXPECTED_TARGET` | An actual record is outside the named semantic set | consumer identity and route membership |
| `DUPLICATE_SEMANTIC_RECORD` | Two actual records have the same field, target, label, kind, and alias | ledger deduplication and occurrence identity |
| `REQUIRED_FRONTIER` | A required field path stops at a frontier | last accepted transform and frontier proof |
| `OCCURRENCE_TERMINAL_MISMATCH` | An attachment does not have exactly one terminal owned by its occurrence | occurrence surface and terminal anchor |
| `CONSUMER_TERMINAL_MISMATCH` | The consumer has no single proven exact relation to its field-lineage terminal | evidence elements and relations |
| `RELATION_COUNT_SHORTFALL` | Proven consumer-terminal relations do not meet the obligation count | relation IDs and obligation cardinality |
| `SEMANTIC_HASH_CHANGED` | Stable proof identity changed between fresh runs or before/after snapshots | source, field, occurrence, terminal, and relation IDs |
| `UI_SOURCE_IDENTITY_MISMATCH` | API proof is correct but normal source selection does not activate it | picker state, route state, and selected origin |

The positive field-proof gate requires named obligations, not counts alone.
Required field paths with frontiers fail the gate.

## Broad route trajectory diagnosis

The legacy flow tools remain valid for broad route diagnosis:

| Class | Decisive evidence | Inspect first |
|---|---|---|
| `ROUTE_NOT_FOUND` | Route key, path, or file cannot be reconciled | route discovery and selection payload |
| `SOURCE_NOT_DISCOVERED` | Route exists but the persisted source is absent | source-call classification and operation creation |
| `RETURN_HANDOFF_MISSING` | Source exists but its consumer handoff is unproven | resource and return handoff analysis |
| `SOURCE_PROJECTION_MISSING` | Handoff is proven but exact source trajectories are absent | route-data projection |
| `GRAPH_TRUNCATED` | A path or depth budget stops exhaustive traversal | trajectory budgets and branching |
| `PROP_BRIDGE_MISSING` | Expected component is absent and no supported prop bridge reaches it | prop roots and component identity |
| `CONTEXT_BRIDGE_MISSING` | Expected context consumer is absent | provider and hook channel recognition |
| `CONTEXT_MEMBER_OVERMATCH` | An unrelated consumer is selected | context member lineage and field reads |
| `API_PROOF_COMPLETE` | Broad API trajectory is exact and precise | proceed to field proof or UI verification |
| `UI_PROJECTION_MISMATCH` | API trajectory is correct but visible highlighting differs | frontend model and URL state |

Broad path counts and `handoffProven` do not prove selected-source field flow.

## Adapter rules

- Match syntax kinds and resolved compiler symbols.
- Treat only reviewed value-preserving wrappers as transparent.
- Require one unambiguous declaration or boundary identity.
- Preserve the selected field or context member across bridges.
- Fail closed when identities are ambiguous.
- Never infer flow from labels, filenames, containment, imports, or stage order.
