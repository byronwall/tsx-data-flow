# Repository guidance

Read [docs/application-structure.md](docs/application-structure.md) before making structural changes. It describes the analyzer, report, server, HTML, and Solid frontend boundaries.

Read [docs/design-preferences.md](docs/design-preferences.md) before changing frontend layout, tables, controls, typography, color, or information hierarchy.

## Product iteration workflow

- Optimize for product development, rapid iteration, and prototypes that answer whether an idea works. Prefer getting the behavior into a reviewable state over maintaining tests during each exploratory revision.
- During product iteration, do not create, update, delete, or otherwise adjust tests unless the user explicitly asks for test work.
- Do not change tests merely to make an in-progress implementation pass. If an existing test exposes a concern, report it without modifying the test suite.
- Use lint and TypeScript checks as the routine implementation feedback loop. Manually exercise the relevant behavior when practical.
- Once the implementation is in a good state, ask the user whether tests should be updated. Do not treat finishing the implementation, a request to verify it, or existing test failures as implicit approval to modify tests.

## Keep modules focused

- Give each file one primary reason to change. Do not combine route orchestration, resource loading, data shaping, browser interaction state, and large JSX/HTML renderers in one module.
- Treat 300 lines as a review signal and 400 lines as a strong extraction signal. The lint ceiling is a backstop, not a target.
- Keep route components thin. Extract reusable layout, interaction-heavy islands, pure selectors/models, and serialization helpers into their own modules.
- Move state and lifecycle cleanup with the behavior that owns it. Timers, listeners, observers, and subscriptions must be cleaned up in the component or controller that creates them.
- Prefer direct imports from defining modules. Do not add barrel files or forwarding exports.
- Preserve behavior during structural refactors. Avoid mixing feature changes into file-splitting work; if a required fix is unavoidable, report the behavior change and defer any test adjustments to the user-approved test phase.

## Frontend safety

- Keep Solid's initial DOM structure deterministic. Do not branch during render on `window`, `document`, viewport size, time, or randomness.
- Keep SSR-sensitive shells structurally stable. Pass data or component callbacks across boundaries instead of conditionally reinserting pre-created JSX elements.
- Put pure filtering, sorting, aggregation, and graph shaping outside JSX components.
- Put delegated DOM interaction logic in a focused component or controller rather than the route composition root.
- Use background color alone to distinguish filled badges, rows, cards, and callouts. Do not add a left border, inset-left shadow, or pseudo-element rail to an element that already has a background fill.

## Verification

For selected-source field-flow repairs, use the maintained acceptance runner:

```bash
pnpm accept:route-field-proof \
  --root <analyzed-project-root> \
  --route <route-path-or-key> \
  --source <source-key-or-file:line[:column]> \
  --obligations scripts/route-field-proof-obligations.json
```

The runner is the authority for named field-to-consumer proof. Keep fixture
obligations outside generic analyzer discovery. A positive field-flow repair
requires one real positive case, one negative precision case, and the normal
user control. Zero positive attachments fail closure.

Static checks alone do not close a field-flow repair. Lint and typecheck prove
code health. They do not prove useful field evidence or correct UI activation.

For browser checks, use a fresh service. Record the analyzer and frontend
commit, port, project root, generation, and asset mode. Do not accept evidence
from a service another worker is changing.

When checking a local development server with `curl`, always run `curl` with elevated/outside-sandbox permissions. Do not attempt the request in the sandbox first, and do not interpret a sandbox connection failure as evidence that the server is down. This applies to `localhost`, `127.0.0.1`, and all local ports.

- During product iteration, run `pnpm lint` and `pnpm typecheck` as the default static checks. These catch lint and type errors without entering the deferred test phase.
- Do not run tests or `pnpm verify` until the user explicitly approves test work. After approval, update tests as needed and use `pnpm verify` as the final quality gate; it runs the server and frontend type checks, tests, and lint through the repository's verification script.
- Never run `pnpm build`, `pnpm build:server`, `pnpm build:frontend`, or any other command that invokes a build script. Production builds are not part of agent verification in this repository.
- Keep post-approval final verification centralized in `scripts/verify.mjs`; do not substitute an ad hoc collection of separate commands for `pnpm verify`.
