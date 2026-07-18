# Core Semantic Primitives

The product should be built from a small evidence kernel. Every higher-level feature should be a query or projection over these primitives.

## Primitive 1: Stable code identity

Represent a declaration or expression within one analysis generation.

```ts
type CodeIdentity = {
  id: string;
  kind: "symbol" | "expression" | "synthetic";
  name: string | null;
  location: SourceSpan;
  definition: SourceLocation | null;
  checkerSymbolKey: string | null;
  typeShapeId: string | null;
  confidence: EvidenceConfidence;
};
```

Rules:

- use TypeScript symbol identity when available;
- keep synthetic identities explicit for framework-generated or config-derived entities;
- never merge by display name alone;
- make IDs analysis-generation-local unless a separately designed durable fingerprint exists.

Existing foundation: `ExpressionIdentityEvidence`.

## Primitive 2: Semantic entity

Represent the things users reason about, independently of visualization level.

```ts
type SemanticEntityKind =
  | "application" | "package" | "subsystem" | "folder" | "file"
  | "route" | "endpoint" | "cli-command" | "job"
  | "component" | "function" | "state-cell" | "context"
  | "domain-type" | "value" | "field"
  | "database-model" | "external-system" | "terminal";
```

An entity has evidence, parent candidates, capabilities, and a confidence. A route derived from filesystem convention is a semantic entity with adapter evidence; it is not faked as a source expression.

## Primitive 3: Boundary

Classify a crossing whose semantics affect interpretation.

```ts
type BoundaryKind =
  | "entry" | "framework" | "server-client" | "network"
  | "database-read" | "database-write" | "filesystem"
  | "serialization" | "context" | "state" | "opaque-call"
  | "render" | "external";
```

A boundary records direction, protocol/adapter, input/output identities and shapes, location, and whether analysis crossed it. This generalizes today's helper and unknown boundaries without erasing their specificity.

## Primitive 4: Typed value shape

Normalize shallow compiler types into deterministic structural facts.

```ts
type ValueShape = {
  id: string;
  kind: "primitive" | "literal" | "object" | "array" | "tuple" |
    "union" | "function" | "opaque";
  symbolKey: string | null;
  displayName: string | null;
  fields: FieldShape[];
  elementShapeId: string | null;
  nullish: boolean;
  opacityReason: string | null;
};
```

Keep recursion shallow and referenced. Size is not a defect signal.

## Primitive 5: Field provenance

For each output field, record its relation to upstream fields.

```ts
type FieldProvenance = {
  outputField: FieldIdentity;
  inputs: FieldIdentity[];
  effect: "preserved" | "renamed" | "derived" | "defaulted" |
    "aggregated" | "introduced" | "unknown";
  evidence: SourceLocation[];
};
```

This is the minimum fact needed to distinguish a linked projection from a disconnected mirror and a legitimate derivation from silent field loss.

## Primitive 6: Operation

Record one ordered relationship between value states.

```ts
type OperationKind =
  | "alias" | "read-field" | "pick" | "omit" | "pack" | "spread"
  | "rename" | "map" | "filter" | "select" | "group" | "sort"
  | "aggregate" | "normalize" | "parse" | "serialize"
  | "call" | "read-state" | "write-state" | "render"
  | "event" | "request" | "response" | "persist" | "unknown";

type Operation = {
  id: string;
  kind: OperationKind;
  inputs: string[];
  outputs: string[];
  beforeShapeIds: string[];
  afterShapeIds: string[];
  semanticEffect: "none" | "narrow" | "derive" | "combine" |
    "lose" | "restore" | "side-effect" | "unknown";
  identityEffect: "preserved" | "projected" | "lost" | "restored" | "unknown";
  controlDependencies: string[];
  evidence: SourceLocation;
  confidence: EvidenceConfidence;
};
```

Current trace steps can seed this model, but an operation must not claim before/after semantics until checker or syntax evidence proves them.

## Primitive 7: Control predicate and variant

Represent why an operation or terminal exists in one state and not another.

```ts
type Predicate = {
  id: string;
  expressionIdentityId: string;
  outcomes: Array<{ label: string; narrowedShapeIds: string[] }>;
};

type Variant = {
  id: string;
  subjectIdentityId: string | null;
  predicateOutcomes: Array<{ predicateId: string; outcome: string }>;
  terminals: string[];
  changedFields: string[];
  exclusivity: "exclusive" | "simultaneous" | "unknown";
};
```

Repeated-fork findings, conditional style fields, and rest/drag DOM branches then become projections of the same primitive.

## Primitive 8: State cell and transition

Model interactive values as stateful identities rather than generic calls.

```ts
type StateCell = {
  id: string;
  ownerEntityId: string;
  mechanism: "signal" | "store" | "resource" | "context" | "url" |
    "local-storage" | "cache" | "other";
  valueShapeId: string;
};

type StateTransition = {
  id: string;
  trigger: string;
  reads: string[];
  writes: string[];
  optimisticFor: string | null;
  confirmedBy: string | null;
  rollback: string | null;
  evidence: SourceLocation[];
};
```

This supports drag state, optimistic maps, resource refresh, and URL state without pretending static analysis knows runtime ordering beyond explicit evidence.

## Primitive 9: Entry point and terminal

Entry points and terminals are typed ends of trajectories.

```ts
type EntryPoint = {
  id: string;
  kind: "route" | "endpoint" | "cli" | "job" | "event" | "message";
  parameters: Array<{ name: string; shapeId: string | null }>;
  framework: string | null;
  evidence: SourceLocation[];
};

type TerminalKind =
  | "jsx-text" | "dom-attribute" | "component-input" | "style"
  | "http-response" | "database-write" | "filesystem-write"
  | "network-request" | "message-publish";
```

Adding non-render terminals is essential: otherwise the graph can never explain edit reconciliation.

## Primitive 10: Semantic edge

Use one edge schema with explicit meaning.

```ts
type EdgeKind =
  | "data" | "control" | "render-hierarchy" | "call" | "state-transition"
  | "contains" | "imports" | "boundary-crossing" | "possible-runtime";
```

Every edge records direction, evidence, confidence, and aggregation count. Visual projections may hide edge families, but must not combine them without labeling.

## Primitive 11: Hierarchical group

Groups are first-class, multi-membership views over entities.

```ts
type GroupingScheme = "filesystem" | "package" | "framework" | "route" |
  "feature" | "domain" | "runtime" | "community";
```

Requirements:

- an entity can belong to different groups under different schemes;
- collapsed edges are exact aggregations of member edges;
- boundary stubs retain external direction and counts during isolation;
- group confidence/evidence is visible;
- no single inferred clustering is presented as the architecture.

## Primitive 12: Trajectory

A trajectory is an ordered, query-specific slice through entities, values, operations, predicates, boundaries, state transitions, and terminals.

```ts
type Trajectory = {
  id: string;
  query: { startIds: string[]; endIds: string[]; direction: "forward" | "backward" | "both" };
  orderedOperationIds: string[];
  branchIds: string[];
  boundaryIds: string[];
  terminalIds: string[];
  completeness: "complete-for-scope" | "partial" | "unknown";
  omissions: string[];
};
```

Repository maps, type ledgers, geometry explanations, and work packets all select and render trajectories differently.

## Primitive 13: Finding

A finding is a predicate over evidence primitives, never an ungrounded score.

```ts
type Finding = {
  invariant: string;
  evidenceIds: string[];
  responsibleEntityIds: string[];
  affectedTrajectoryIds: string[];
  confidence: EvidenceConfidence;
  disproofCondition: string;
  recommendation: string | null;
};
```

Examples of invariants:

- identity is dropped and later restored without a required boundary;
- the same canonical field receives conflicting defaults;
- one discriminant controls several sibling render forks;
- a write payload mirrors a canonical type without compiler linkage;
- grouping ownership conflicts with the interaction's movement domain.

## Primitive dependency chain

```text
source spans + compiler symbols + framework config
  -> code identities + semantic entities
  -> type shapes + entry points + boundaries + state cells + terminals
  -> operations + provenance + predicates + transitions + semantic edges
  -> trajectories + hierarchies + variants
  -> maps + ledgers + lifecycle views + findings
  -> work packets + comparisons
```

Build and test in this order. A UI should not invent semantics missing from the lower layer.

