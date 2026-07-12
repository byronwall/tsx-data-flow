# Plan: Type-Shape and Transformation Tracing

## Why this feature

The analyzer can currently show that a render path contains aliases, object packs,
calls, conditionals, and fallbacks. It also records a type string on graph nodes.
What it cannot yet answer directly is the more useful question raised in
`dev-tools-project-transcript.md`:

> How did the available data change between the original value and the rendered
> value, and which of those changes were actually necessary?

This is the clearest missing analysis layer between today's syntax-oriented path
trace and the product intent to identify unnecessary packing, unpacking,
representation changes, relay hops, and invented edge cases.

The first version should stay anchored to paths that terminate in TSX/JSX while
using project-wide type context. It should support the whole-project world view
without attempting to display every type or syntax node. Database, filesystem,
and backend-to-backend sinks are later extensions of the same model.

## Product outcome

From a selected JSX sink, a reviewer can see a compact transformation ledger:

```text
Project[] -> filtered Project[] -> Project -> project.id -> Project lookup -> Project
             filter             select     narrow       expand             same entity
```

The tool highlights the suspicious part—especially fields being dropped and
later reconstructed, or certainty being lost and repeatedly normalized—and
links every step to source. The
reviewer can distinguish:

- semantic transformations from representation-only changes;
- lossless narrowing from information loss;
- collection filtering, selection, aggregation, and expansion;
- object-to-scalar-to-object round trips;
- typed structures crossing opaque boundaries such as strings, JSON, `any`, or
  unknown external calls;
- actual contract normalization from repeated or type-impossible defenses.

The project overview also uses these facts to color and rank broader areas. A
reviewer can select an important type/value in the world view and follow its
trajectory into the focused ledger.

## First-release priorities

Implement detectors in this order:

1. **Dropped then recovered fields.** Detect a value derived mostly from one
   upstream object, with fields removed and later restored, merged, or looked up.
   Show field provenance and whether the derived shape is nearly equivalent to
   the upstream shape.
2. **Repeated normalization and introduced uncertainty.** Detect the same value
   defaulted more than once, certainty lost at async/resource boundaries, and
   inconsistent defaults applied downstream.
3. **Representation flip-flops.** Add after the first two are reliable; matching
   before/after shapes is evidence, not proof that the intermediate form is bad.

Object-to-ID-to-object is a strong special case of dropped-then-recovered data,
not the headline detector by itself.

## Real-repository evaluation cases

Use concrete trajectories from the product's four reference repositories:

- **HN Offline (`/Users/byronwall/Projects/hn-client`):** server/store/context
  values reaching story and comment TSX; pay particular attention to resource,
  offline, and temporarily unavailable state introducing optionality.
- **Logo Dodo (`/Users/byronwall/Projects/ai-icon-kit`):** `Project`, `Board`, and
  `Candidate` fields passing through storage, API responses, refinement and
  segmentation models, then workbench components. This is the primary
  near-copy/field-provenance fixture.
- **Visual Notes (`/Users/byronwall/Projects/visual-notes`):** documents crossing
  Markdown, HTML, database, and editor boundaries, plus embeddings flowing into
  UMAP projections and canvas models. These are important legitimate
  transformations and opaque-boundary controls.
- **Pluck (`/Users/byronwall/Projects/pluck-ui`):** captured page, section, node,
  fragment, DOM/CSS snapshot, annotation, inventory, and layout forms. This is
  the primary scale and dropped/recovered-field stress fixture.

Each detector needs both a useful positive example and a legitimate neighboring
path it does not escalate. Record the selected paths and expected evidence in a
small checked-in evaluation manifest once the first analyzer slice can identify
them reliably; do not key that manifest to durable graph IDs.

## What exists to build on

- `TraceStep` already carries operation kind, type-adjacent source location, and
  a detail string.
- graph nodes already have a checker-derived `type`.
- `representationSteps`, pack groups, defenses, and path metrics already capture
  several important symptoms.
- helper tracing can bind local/cross-file call arguments when enabled.
- the code map already provides the correct source-left/detail-right home.

The missing piece is a normalized description of the value before and after each
operation. Type strings alone are too unstable and too coarse for comparison.

## Domain model

Add analyzer-domain structures; do not put display prose or CSS concepts in the
analysis layer.

```ts
interface ValueShape {
  kind: "primitive" | "object" | "tuple" | "collection" | "union" |
    "opaque" | "unknown";
  typeText: string;
  symbolKey: string | null;
  nullable: boolean;
  fields: Array<{ name: string; typeText: string; optional: boolean }>;
  element: ValueShape | null;
}

interface TransformationStep {
  operation: "alias" | "project" | "pick" | "pack" | "rename" | "filter" |
    "select" | "aggregate" | "expand" | "parse" | "serialize" |
    "normalize" | "opaque-call" | "other";
  before: ValueShape;
  after: ValueShape;
  semanticEffect: "none" | "narrow" | "derive" | "lose" | "restore" |
    "unknown";
  identityEffect: "preserved" | "projected" | "lost" | "restored" | "unknown";
  location: { file: string; line: number };
  confidence: "proven" | "inferred" | "unknown";
}
```

`symbolKey` is analysis-generation-local and checker-derived. It is not a durable
public ID. `fields` must be capped in DTOs, with a truthful total count.

Field provenance is also required. Each visible output field should retain the
upstream symbol/property it came from when that relationship is provable. That is
what allows the product to show that five of six fields were merely bounced
through a derivative type while one field changed.

## Detection slices

### Phase 1: Normalize checker types

Create a focused type-shape module under `src/analysis/` that converts a
`ts.Type` into `ValueShape`.

Start with:

- primitives and literals;
- named object types and visible properties;
- arrays, readonly arrays, and tuples;
- unions and nullish membership;
- `any`, `unknown`, type parameters, and unresolved types as explicit opacity.

Avoid recursive expansion. Use symbol identity plus a shallow field inventory.
This is enough to show narrowing and re-expansion without creating enormous
recursive payloads.

Verification:

- unit fixtures for objects, unions, arrays, tuples, optional fields, generics,
  `any`, and recursive types;
- deterministic serialization assertions;
- a benchmark for shape extraction on the existing realistic fixture.

### Phase 2: Record before/after shapes on trace operations

Extend tracing so an operation can retain both the input and output checker type.
Classify only high-confidence syntax first:

- property/element access: `project`;
- object literal/spread: `pack`, `pick`, or `rename` when provable;
- `.filter`: collection-preserving `filter`;
- indexing, `.find`, and `.at`: many-to-one `select`;
- `.map`: collection element transformation;
- `.reduce` and known numeric reducers: `aggregate` when provable;
- `JSON.parse`/`JSON.stringify` and explicit parsers: `parse`/`serialize`;
- fallback and optional access: `normalize`;
- unresolved calls: `opaque-call`, never a guessed semantic transform.

Keep the existing trace-step vocabulary. `TransformationStep` is an additional
semantic projection, not a replacement for evidence about the syntax path.

Verification:

- focused fixtures per operation;
- negative tests showing custom methods and ambiguous callbacks remain unknown;
- cross-file helper tests proving parameter binding preserves before/after types.

### Phase 3: Add smell detectors over transformation sequences

Add findings only for patterns with concrete evidence:

1. **Drop then recover** — fields disappear from a packed/picked structure and a
   later lookup or merge restores them. Include an object-key-object round trip
   as a high-confidence subtype.
2. **Introduced uncertainty** — a previously certain value becomes optional at a
   resource, async, wrapper, or derived boundary and requires downstream guards.
3. **Repeated normalization** — the same lineage is normalized more than once or
   receives inconsistent downstream defaults.
4. **Representation flip-flop** — the path repeatedly moves between equivalent
   shapes without a semantic effect.
5. **Opaque structure boundary** — a typed object becomes HTML/JSON/string/`any`
   and structured access resumes later.

Each detector emits:

- exact sequence and locations;
- why it is suspicious;
- confidence and the fact that would disprove it;
- a concise action framed around the code's types, not generic refactoring prose.

Do not label ordinary projection, filtering, aggregation, or serialization as a
problem by itself. Those remain browsable transformation facts below the finding
threshold.

Group detector output by common upstream cause. One dropped object shape that
affects twelve sinks is one cleanup opportunity with a twelve-sink blast radius,
not twelve competing findings.

### Phase 4: Put the ledger in the code map

Add transformation entries to the unified per-file inventory and attach them to
the involved expression/symbol. Selecting one should:

- overlay numbered locations on source;
- render the before/after shape sequence in the detail panel;
- show field loss/restoration with capped, drillable field lists;
- distinguish proven steps from inferred and opaque steps;
- keep ordinary transformations browsable without calling them findings.

Use three explicit evidence labels in the UI:

- **Proven unnecessary** for type-impossible defenses and equally strong facts;
- **Suspicious transformation** for plausible structural problems that require
  developer judgment;
- **Trace incomplete** when opacity prevents a useful conclusion.

Only the first level may use direct removal/fix language. Suspicious entries show
what happened and where, without prescribing a contract change.

The main visual should be a compact horizontal path, not a whole-project graph.
Use width or grouped field chips only where it improves comparison; do not imply
that a ten-field object is inherently worse than a two-field object.

### Phase 5: Markdown and comparison

After the human-facing analysis proves trustworthy, add a dense Markdown section
as an agent breadcrumb rather than a full UI reproduction:

```text
Object-to-ID-to-object round trip — src/Card.tsx:42
Project (8 fields) -> project.id -> getProject(id) -> Project (8 fields)
Why: identity and fields are discarded, then immediately recovered downstream.
Action: carry Project through EditTitle, unless the scalar boundary is required
by a documented component contract.
```

Add aggregate comparison metrics only after detector precision is acceptable:

- suspicious transformation sequences introduced/removed;
- opaque boundaries introduced/removed;
- net representation flip-flops;
- affected changed files and downstream sinks.

## Acceptance criteria

- A reviewer can inspect the type/shape evolution for any supported selected
  render path without leaving the code map.
- A reviewer can select an important SolidStart boundary/context type or
  high-transformation value from the world view and follow it to TSX sinks.
- A derived shape shows per-field provenance when most fields originate from one
  upstream object.
- Findings sharing an upstream cause are grouped with total sink/file reach.
- The analyzer detects object-to-key-to-same-object round trips across a local or
  traced first-party helper.
- Ambiguous calls and generics are shown as unknown rather than assigned a false
  transformation.
- Every finding includes source-linked before/after evidence and a disproof
  condition.
- Ordinary legitimate projections remain facts, not findings.
- Scoped analysis remains within the product's 1–5 second target on the benchmark
  fixture, or the feature ships behind an explicit deeper-analysis option.

## Non-goals

- inferring runtime values or database schemas without typed source evidence;
- rendering the entire project graph at once;
- proving that a transformation is unnecessary solely because shapes match;
- tracing arbitrary HTML or JSON contents in the first release;
- automatic rewrites.
- treating every large type or derivative type as a problem without path evidence.

## Main risks

- **Type text instability:** compare normalized symbol/field facts, not formatted
  type strings.
- **False identity restoration:** require checker symbol agreement or label the
  match inferred.
- **Graph explosion:** compute ledgers only for participating/scoped paths and
  cap DTO details.
- **Taste masquerading as correctness:** separate transformation facts from
  thresholded smells and always expose the evidence.
