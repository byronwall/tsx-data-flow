# bad-ish-solid example

This tiny project is deliberately awkward TSX for demonstrating `tsx-dataflow` reports. It has a route shell that packs source props into broad models, relays those models through child components, rebuilds view objects in render paths, and leaves fallback logic around values that are often already typed as present.

Regenerate the reports from the repository root:

```bash
pnpm examples:regenerate
```

Representative outputs are checked in under [`reports/`](reports/).
