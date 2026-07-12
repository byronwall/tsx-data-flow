# Current-State Reference Repository Baseline

Date: 2026-07-11

This is the carried-forward Phase 0 preflight required by Phase 2. It is a baseline of the post-Phase-1 working tree; a pre-Phase-1 baseline can no longer be reconstructed from the uncommitted tree.

## Commands

```sh
pnpm analyze --root <repository> --view overview --format json --max-items 5
pnpm benchmark:workspace --root <repository>
```

The manifest is [`reference-repositories.json`](reference-repositories.json). Runs were read-only against the target repositories.

## Measurements

| Repository | Cold analysis | Sources | Sinks | Graph nodes | Graph edges | Unknown edges | Unknown/edge | Workspace DTO | Projection | JSON parse | Retained map |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| HN Offline | 2.76 s | 157 | 186 | 1,559 | 1,396 | 3 | 0.21% | 100,196 B | 10.09 ms | 0.27 ms | 42 areas, 59 links, 40 trajectories |
| Logo Dodo | 11.01 s | 1,610 | 2,828 | 18,941 | 16,426 | 3 | 0.02% | 212,289 B | 62.69 ms | 0.54 ms | 80/143 areas, 30 links, 40 trajectories |
| Visual Notes | 13.84 s | 2,288 | 4,198 | 25,111 | 21,266 | 8 | 0.04% | 240,715 B | 76.51 ms | 0.60 ms | 80/232 areas, 4 links, 40 trajectories |
| Pluck | 21.74 s | 2,397 | 4,841 | 31,967 | 28,377 | 3 | 0.01% | 1,036,337 B | 200.32 ms | 5.25 ms | 369/369 areas, 586/586 links, 400 trajectories |

Map caps are 400 lightweight file areas, 800 aggregated links, 400 coverage-first representative trajectories, and 40 cleanup opportunities. Totals remain in the DTO when rows are capped. Connection and trajectory retention reserve representative evidence per indexed area before global ranking fills the remaining capacity. The graph renders at most 36 areas at once and exposes the indexed area set through hierarchical folder scopes.

## Stable evaluation targets

- **HN Offline:** `AppDataContext.tsx` into `HnComment.tsx`, `HnStoryPage.tsx`, and story-list terminals. Known legitimate path: store/context distribution. Suspected complexity: repeated style/default work in `HnComment.tsx`.
- **Logo Dodo:** `Project`, `Board`, and `Candidate` definitions and storage helpers into `CandidateGrid.tsx`, `ProjectSidebar.tsx`, and the workbench routes. Known legitimate path: candidate crop/layout calculation. Suspected complexity: repeated derivative board/candidate representations.
- **Visual Notes:** Markdown/editor and embeddings/UMAP paths into `VisualCanvas.tsx` and canvas routes. Known legitimate path: Markdown-to-HTML and embeddings-to-UMAP are semantic transformations. Suspected complexity: repeated normalization at editor boundaries.
- **Pluck:** capture inventory types and store functions into `CaptureStructureInventoryRouteShell.tsx` and inventory/viewer components. Known legitimate path: capture detail to inventory presentation. Suspected complexity: reconstructed inventory/view-model fields.

## Baseline audit

- All four repositories analyze reproducibly and have relocatable file/symbol targets.
- Unknown-edge counts are low, but that does not prove complete cross-file flow. Only checker-proven definition/trajectory relationships are serialized; the UI does not invent import or name-based edges.
- The current top-five rows are suspicious transformations, not proven cleanups. The baseline therefore does not authorize automatic edits.
- The source pane can locate each named TSX target and Phase 1 provides definition/type-definition navigation. The Phase 2 graph is intentionally bounded to 36 simultaneous nodes; indexed areas remain reachable through hierarchical folder scopes and the complete file table.
