# Repository guidance

Read [docs/application-structure.md](docs/application-structure.md) before making structural changes. It describes the analyzer, report, server, HTML, and Solid frontend boundaries.

## Keep modules focused

- Give each file one primary reason to change. Do not combine route orchestration, resource loading, data shaping, browser interaction state, and large JSX/HTML renderers in one module.
- Treat 300 lines as a review signal and 400 lines as a strong extraction signal. The lint ceiling is a backstop, not a target.
- Keep route components thin. Extract reusable layout, interaction-heavy islands, pure selectors/models, and serialization helpers into their own modules.
- Move state and lifecycle cleanup with the behavior that owns it. Timers, listeners, observers, and subscriptions must be cleaned up in the component or controller that creates them.
- Prefer direct imports from defining modules. Do not add barrel files or forwarding exports.
- Preserve behavior during structural refactors. Avoid mixing feature changes into file-splitting work unless a required fix is covered by tests.

## Frontend safety

- Keep Solid's initial DOM structure deterministic. Do not branch during render on `window`, `document`, viewport size, time, or randomness.
- Keep SSR-sensitive shells structurally stable. Pass data or component callbacks across boundaries instead of conditionally reinserting pre-created JSX elements.
- Put pure filtering, sorting, aggregation, and graph shaping outside JSX components.
- Put delegated DOM interaction logic in a focused component or controller rather than the route composition root.

## Verification

Run these after structural changes:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

