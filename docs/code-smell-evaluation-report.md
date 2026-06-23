# Code Smell Evaluation Report

This report reviews how `tsx-dataflow` evaluates render-path code smells, with
special attention to the line between useful defensive/domain code and avoidable
reviewability burden. It is based on the current implementation in
`src/core.mjs`, the README, tests, and the checked-in `examples/bad-ish-solid`
reports.

## Executive Summary

`tsx-dataflow` is not a generic lint rule set. It is a render-path data-flow
analyzer: it starts at JSX sinks, traces values backward through props, locals,
helpers, object literals, fallbacks, conditionals, Solid accessors, and
first-party helper calls, then ranks the paths that contain the most plumbing.

The default output is conservative in one important way: it does not say that
all fallbacks, transforms, or packed objects are bad. Instead, it treats them as
evidence. A path becomes a high-priority finding when several signals stack:

- Deep source-to-JSX paths.
- Many helper hops.
- Many representation-only wrappers such as aliases and object packs.
- Multiple fallbacks or optional reads.
- Type-impossible defenses.
- Control flow mixed into render expressions.
- Inputs from many sources.
- Sources that feed many sinks.

The strongest positive behavior is that type-impossible guards are separated
from ordinary fallbacks. A fallback on a value whose TypeScript type can include
`undefined` is classified as possible and usually framed as compatibility or
domain normalization. A fallback on a non-nullish type is classified as
impossible and treated as stale dead code. That is the main mechanism that keeps
legitimate defensive code from being flattened into the same bucket as useless
guards.

The tool's default taste is: keep JSX shallow, move required normalization to a
named boundary, keep render models responsibility-specific, and formalize wide
or repeated cross-component data flow behind a feature boundary. If you follow
the generated work-packet guidance literally, the code you tend to get is not
"minimal code"; it is render code with named intermediate models and fewer
inline derivations.

## What The Analyzer Actually Measures

The analyzer builds one sink record per JSX expression or attribute. For each
sink it stores:

- The rendered expression and sink category.
- Actionable roots, excluding literals, globals, and bare parameter objects.
- A representative longest path of operation steps.
- Packed object locations on the path.
- Defensive operation records.
- Path metrics.
- Ranking scores.
- Queue assignment and confidence.

The key metric function is `metricsFor`. It derives:

| Metric                    | What It Means                                    | Smell Signal                                       |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `maximumPathDepth`        | Longest traced operation chain to JSX.           | Review burden; hard-to-scan render path.           |
| `helperHops`              | Number of call operations.                       | Indirection; helper-heavy derivation.              |
| `representationChurn`     | Object packs, spreads, and aliases.              | Packing/repacking without clear semantic boundary. |
| `defensiveOperationCount` | Fallbacks and optional reads.                    | Normalization pressure; possibly stale guards.     |
| `impossibleDefenseCount`  | Defenses that cannot fire under checked types.   | Dead defensive code; strongest smell.              |
| `controlDependencyCount`  | Conditional operations.                          | Branching mixed into render derivation.            |
| `mergeWidth`              | Number of distinct roots feeding the sink.       | Fan-in / many inputs.                              |
| `reachableSinks`          | How many sinks the same actionable source feeds. | Centrality and change risk.                        |
| `repeatedNormalization`   | Defensive operations after the first.            | Same path repeatedly normalizes/defaults.          |
| `unknownEdgeCount`        | Unresolved dynamic or external hops.             | Investigation risk rather than direct cleanup.     |

The default burden score is a weighted blend:

- 15% path depth.
- 15% helper hops.
- 20% representation churn.
- 15% defensive operations.
- 15% impossible defenses.
- 10% control dependencies.
- 10% repeated normalization.

That weighting says a lot about the tool's default taste. Representation churn is
the largest single term, but it is not enough by itself to dominate the report.
Fallbacks matter, and impossible fallbacks matter separately. The tool is mostly
looking for accumulated render-path complexity, not a single forbidden pattern.

## How It Balances Fallbacks

Fallbacks are detected in two forms:

- `??` and `||` become `fallback` operations.
- Optional property access becomes an `optional-read` operation.

Only nullish coalescing and optional reads create detailed defense records. A
plain logical `||` contributes to fallback/churn metrics but is not given the
same type-based nullish verdict. That is a reasonable limitation: `||` may be
truthiness behavior rather than nullish behavior, and the tool avoids pretending
it can always prove intent.

Each defense gets a TypeScript verdict:

| Verdict      | Meaning                                             | Default Interpretation                             |
| ------------ | --------------------------------------------------- | -------------------------------------------------- |
| `possible`   | The guarded type can include `null` or `undefined`. | Likely legitimate fallback or compatibility guard. |
| `impossible` | The guarded type excludes `null` and `undefined`.   | Stale guard; dead defensive code.                  |
| `unknown`    | The type is `any`, `unknown`, or a type parameter.  | Needs investigation.                               |

The additional `origin` label is where the tool is most careful:

- `stale (type-impossible)` for impossible defenses.
- `compatibility (documented)` when a leading comment mentions persistence,
  legacy, compatibility, migration, or deprecation.
- `compatibility (optional)` for optional property access or a type that includes
  `undefined`.
- `defensive (review)` for possible but otherwise unclassified defenses.
- `unknown` when the type cannot be trusted.

This is the core answer to "how does it balance fallbacks?" It does not punish
the existence of a fallback in isolation. It punishes repeated fallback work on a
render path, and it strongly highlights fallbacks that the checked type says can
never run.

### Good Enough Fallback Code

The following patterns are usually acceptable under this tool's philosophy:

- A boundary model normalizes optional API or persisted data once.
- JSX reads a named value that already includes the fallback.
- A compatibility fallback has a real optional type or a comment explaining the
  migration/legacy reason.
- The fallback sits at a feature or data boundary, not repeated in many leaf
  sinks.

The following patterns are likely to rank:

- The same optional value is defaulted repeatedly in several JSX attributes.
- A fallback remains after the model type has been tightened.
- A fallback is buried inside a long path that also packs objects, calls helpers,
  and formats strings.
- A fallback feeds many sinks through a central object, increasing reach and
  change risk.

## Type-Impossible Guards

Type-impossible guards are treated as the clearest smell in the system. They
increase `impossibleDefenseCount`, influence burden score, change the finding
title to `type-impossible defensive render path`, raise severity to `HIGH`, and
add the candidate edit:

> Remove the type-impossible fallback(s) — unreachable under the checked types.

This is a stronger claim than "the code is verbose." It is a claim that the
runtime branch is unreachable according to the same TypeScript program the repo
uses.

There are still practical limits:

- The verdict is only as good as the project's TypeScript types.
- `any`, `unknown`, and type parameters are intentionally not called impossible.
- `||` truthiness fallbacks are not nullish-proved the same way as `??`.
- Indexing can look safer than it really is depending on compiler options such
  as `noUncheckedIndexedAccess`.

In the example app, `row.label ?? "Untitled"` ranks high because the helper
returns a non-null `label` while the render leaf still keeps a nullish fallback.
That is exactly the kind of stale guard the tool is tuned to remove.

## Packing, Unpacking, And Representation Churn

The analyzer treats object literals as `object-pack` operations and local
variables as `alias` operations. These feed `representationChurn`.

The tool does not say every object model is bad. It distinguishes between:

- A render model: a packed object feeding one coherent sink family.
- An overpacked bag: one packed object feeding multiple sink families.

Sink families are derived from JSX target attributes:

| Family         | Examples                                  | Meaning                             |
| -------------- | ----------------------------------------- | ----------------------------------- |
| `svg-shell`    | `width`, `height`, `viewBox`              | Shell sizing.                       |
| `geometry`     | `x`, `y`, `d`, `transform`, `points`, `r` | Element geometry.                   |
| `control-flow` | `when`, `each`, `fallback`                | Render gating or iteration.         |
| `style`        | `class`, `className`, `style`             | Presentation.                       |
| `text`         | Rendered value children.                  | Text/content output.                |
| `other`        | Everything else.                          | Attribute not otherwise classified. |

When one object feeds multiple families, the work packet renders a
`Sink-family split` block. This is one of the tool's better taste mechanisms: it
does not merely say "too many objects"; it says "this object mixes style and
text" or "this object mixes geometry and control flow."

### Good Enough Packing

Packing is generally good enough when:

- The object has a real semantic name and owns one responsibility.
- It feeds a coherent sink family.
- It reduces repetition without becoming a generic bucket.
- JSX reads simple fields from it.
- Defaults and narrowing inside the object are intentional and close to the
  boundary where the source data enters.

Packing becomes suspicious when:

- Objects are packed, unpacked, and repacked through aliases and helpers.
- A packed object mixes geometry, style, control flow, and text.
- The object mostly mirrors props without changing meaning.
- Different consumers need different subsets, but the same broad bag is passed
  everywhere.
- The object name is generic enough that it hides responsibility rather than
  naming it.

The current implementation detects overpacked sink families, but the default
burden score does not yet include sink-family diversity directly. Overpacking
affects reports through `representationChurn`, reviewer summaries, and split
advice, but a short overpacked path can still rank below a longer path with more
fallbacks or helper hops.

## Transformations And Calculations

Transformations are not all treated equally.

The analyzer separates:

- Helper calls (`call`) as semantic or opaque hops.
- Object packing and aliases as representation churn.
- Templates as formatting.
- Conditionals as control dependencies.
- Property reads as normal path steps.
- Solid accessors as memo/signal/resource boundaries.

A domain with lots of calculations can be "good enough" if the calculations are
named and located at an appropriate boundary. The tool mostly objects when the
calculations are mixed directly into JSX paths or when multiple concerns are
interleaved in one packed model.

Shape classification drives the proposed fix:

| Shape Tag                 | Signal                                                                      | Default Suggested Direction                                                                                         |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `local-scalar-geometry`   | Fixed SVG circle/dash scalar math such as center, radius, or circumference. | Prefer local scalar aliases/accessors; do not introduce a helper type/function just to avoid repeated `size() / 2`. |
| `geometry-chain`          | Geometry attributes or arithmetic/template geometry.                        | Extract render-ready geometry model.                                                                                |
| `collection-render-model` | `each` or collection methods.                                               | Extract item models into a memo.                                                                                    |
| `control-flow-gate`       | `when`, `fallback`, or defensive render-control branch.                     | Name predicate or shown value.                                                                                      |
| `presentation-pack`       | Class/style sink or style object pack.                                      | Build class/style object in a small memo.                                                                           |
| `domain-normalization`    | Defensive ops or prop-driven conditional normalization.                     | Resolve defaults at a named boundary.                                                                               |
| `cross-component-relay`   | Multiple prop roots relayed without helper hops.                            | Consider Provider/Context or feature boundary.                                                                      |

This means a chart, SVG layout, table, or formatting-heavy domain is not
automatically bad. The tool wants the calculation to have a named output shape:
`barSizing`, `visibleRows`, `profileData`, `styleProps`, or similar. The current
fallback names in code are sometimes still generic (`renderModel`,
`geometryModel`), but the intended generated code style is clear: JSX should read
named fields, not derive them inline.

## Prop Relay And Context Pressure

The prop-relay and context-relay logic is advisory. It uses local trace shape and
local same-feature signals; it does not inspect ownership docs or repo
architecture.

Signals that push toward Provider/Context or feature-hook advice:

- Many independent prop roots feeding a sink.
- A source reaching many sinks.
- Deep paths or high representation churn with multiple roots.
- A path rooted at a `useX` hook.
- A parent that imports context hooks and passes a bundle of same-feature props
  to a child.
- Shared-looking prop names such as `selection`, `filters`, `actions`, `state`,
  `settings`, or `view`.

The tool has a specific guardrail: imported hooks/context accessors named like
`useX` are not inlined during cross-file helper tracing. They are treated as
intentional feature boundaries. This keeps the analyzer from erasing the
ownership signal it is supposed to report.

Good enough prop passing:

- Narrow display props into leaf components.
- Row-local data that belongs to one child.
- Event handlers that are intentionally leaf-specific.
- Props that do not repeat through several intermediate layers.

Likely smells:

- Parent reads context/model state, then passes broad same-feature bundles to
  child components.
- Multiple children receive the same shared state/action props.
- Props are packed into route/view models and then unpacked into more props.

## Helper Boundaries

Current code traces same-file helpers and first-party imported helpers, with a
bounded maximum depth and a total descent budget. That is important because a
lot of "smell" in real TSX is hidden behind helper functions rather than inline
JSX.

Reached helpers are classified as:

- `thin pass-through (inline)` when the helper just forwards a parameter.
- `confluence / junction` when three or more source lineages converge and the
  helper has multiple callers.
- `leaky boundary` when parameter or return types include `any`, `unknown`, or
  very broad unions.
- `messy internals` when the helper hides depth, churn, defenses, or impossible
  guards.
- `clean pipe` when the helper has narrow types and modest internal work.

This is a useful balance for transform-heavy code. A helper with real
calculation and several callers is not automatically an inline candidate. The
inline preview explicitly says to keep and formalize genuine transformations,
especially junctions. The code that comes out of following the tool should
therefore keep useful domain helpers, but tighten their signatures and move
render leaf derivations out of JSX.

One documentation caveat: `docs/analyzer.md` still says the context is
intentionally file-local and does not resolve imported helper bodies. That is
stale relative to the current implementation and README, which describe
cross-file helper tracing.

## Confidence, Queues, And Risk

Each sink receives a confidence score and queue:

| Condition                      | Confidence / Queue Effect             |
| ------------------------------ | ------------------------------------- |
| Unknown edge exists.           | Confidence 72; queue `investigation`. |
| Defense verdict unknown.       | Confidence 80; queue `investigation`. |
| Impossible defense exists.     | Confidence 99; low-risk cleanup.      |
| All hops resolved.             | Confidence 88; low risk.              |
| High reach or path depth > 10. | Queue `central-leverage`.             |
| Otherwise resolved and local.  | Queue `peripheral-quick-win`.         |

The queue model is sound: unknowns do not become "fix now" items; they become
investigation items. The main weakness is language. Some work packets can read
as if reviewability burden is a bug. The implementation is better than that:
central-leverage and representation-heavy paths are often maintainability
findings, not runtime defects.

## Default Code Style Produced By The Tool

If you follow the default work-packet guidance, you should expect code with
these characteristics:

- JSX attributes read simple named values.
- Repeated defaulting moves to a nearby memo, selector, or boundary model.
- Type-impossible fallbacks are deleted.
- Required compatibility fallbacks remain, ideally with types or comments that
  make intent obvious.
- Geometry and layout math are extracted into render-ready shape objects.
- Collection transforms become named item-model arrays.
- Class/style packing is separated from text/content/geometry packing.
- Broad prop relay is replaced with a feature hook or Provider/Context when the
  same state crosses multiple same-feature components.
- Pure pass-through helpers are inlined.
- Real transformation helpers are kept but made narrower and more typed.

This can produce more named intermediate values than a minimal hand-written
component. That is the intended tradeoff: fewer opaque render paths, more named
responsibility boundaries.

## Where The Tool Is Appropriately Tolerant

The tool is tolerant of domain complexity when the complexity has a clear home:

- Optional API data can be defaulted.
- Persisted or legacy shapes can have compatibility guards.
- Rich view domains can calculate render models.
- SVG/chart code can perform a lot of geometry math.
- Helpers can remain when they consolidate real transformations.
- Context/hooks can remain as feature boundaries.

It generally asks for relocation and naming, not deletion, unless the type
checker proves a guard impossible.

## Where It Can Over-Flag Good Enough Code

The highest false-positive risk is code that is inherently transform-heavy but
already well factored for the domain. Examples:

- Dense chart geometry where many calculations are unavoidable.
- Serialization/deserialization or persisted model adapters.
- UI surfaces where a render model must intentionally contain several related
  fields.
- Components that are intentionally leaf-only and unlikely to be reused.
- Optional fields whose TypeScript types are wider or narrower than the real
  runtime contract.

In those cases, the report should be read as "is this still the right boundary?"
rather than "delete this pattern." The deciding questions are:

- Is the fallback guarding a real runtime shape or stale type history?
- Is the transformation named after the domain concept it produces?
- Does the packed object feed one responsibility or several?
- Does the same source/default/model fan out into enough sinks that one boundary
  would reduce repeated work?
- Would extraction make tests and review easier, or just move code around?

## Practical Guidance For Good Enough Code

Use these rules of thumb when applying the tool:

1. Remove type-impossible guards first. They are the cleanest, lowest-risk wins.
2. Keep possible fallbacks when the domain requires them, but move repeated ones
   to a named boundary.
3. Treat one fallback as normal; treat repeated normalization along one render
   path as a design signal.
4. Keep packed objects that represent one coherent render concept.
5. Split packed objects that feed multiple sink families.
6. Keep real helper boundaries, especially if they are typed and reused.
7. Inline pass-through helpers that only rename or forward values.
8. Prefer feature hooks or context only when state is genuinely shared or
   repeatedly relayed.
9. For calculation-heavy domains, name the result shape rather than trying to
   eliminate the calculations.
10. Use `--spread`, `--diversity`, `--units`, and `--view hotspots` when the
    default burden sort clusters too much in one file.

## Overall Assessment

The tool's smell model is more nuanced than a lint rule and less authoritative
than a human architecture review. Its best signal is "this render path contains
too many responsibilities for nearby JSX," with a particularly strong sub-signal
for type-impossible defensive code.

The default code it encourages is generally high-reviewability Solid/TSX:
render leaves stay simple, normalization is explicit, render models have named
responsibilities, and truly shared state is moved behind a feature boundary. The
right way to use it is not to eliminate every fallback or transform. The right
way is to make required fallbacks and transforms live at obvious, typed,
domain-named boundaries, while deleting the guards and wrappers that the types
or sink-family split show are only historical noise.
