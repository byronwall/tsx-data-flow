# Phase 2 Evaluation: HN Offline

## Run

```sh
pnpm benchmark:workspace --root /Users/byronwall/Projects/hn-client
```

Cold analysis took 2.76 seconds. Workspace projection took 10.09 ms, produced a 100,196-byte DTO, and parsed in 0.27 ms. The map retained all 42 areas, 59 inter-area connections, 40 representative trajectories, and 40 of 107 cleanup opportunities.

## Trajectory and orientation audit

The map visibly separates 17 source-heavy areas, five mixed flow areas, and 20 TSX-terminal areas. `AppDataContext.tsx` is a mixed landmark with connections to story/comment surfaces. Selecting it exposes incoming/outgoing connections, values/types, retained trajectories, and responsible-source links.

Browser verification on a production build:

- warm hard refresh to visible map: 57 ms;
- no console warnings, errors, or hydration failures;
- area selection exposed connections, values/types, and trajectories;
- the selected trajectory links to `/file` with the finding and line target.

## Cleanup and evidence audit

The highest rows are suspicious `HnComment.tsx` style paths (worst burden 0.566), not proven-unnecessary work. They remain evidence for review. The known context/store distribution is treated as orientation structure rather than a cleanup by itself.

False-positive audit: repeated style expressions can be legitimate component-local presentation. Phase 2 shows their shared blast radius but does not claim a specific operation should be removed.

## Exit gate

Passed. A reviewer can orient from stores/context to story/comment TSX and reach responsible source well within one minute.

