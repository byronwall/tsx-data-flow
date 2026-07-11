# Analysis performance baseline

Recorded 2026-07-10 with Node v22.21.1 using `pnpm benchmark:analysis`. The benchmark creates deterministic TSX projects in a temporary directory, analyzes them, reports the result, and removes the fixture.

| Approximate LOC | Files | Findings | Analysis time |
|---:|---:|---:|---:|
| 10,000 | 100 | 3,000 | 1.15 s |
| 50,000 | 500 | 15,000 | 4.53 s |
| 200,000 | 2,000 | 60,000 | 120.20 s |

The generated fixture is intentionally finding-dense: every ten-line block contains several render transformations and fallbacks. It is therefore a stress case for report assembly rather than a typical application. The routine 10K and 50K checks meet the scoped-analysis and normal-project targets; the periodic 200K stress run identifies large-project analysis as a future optimization area.

Loaded browser interactions—overview navigation, source selection, finding/path expansion, native graph selection, and retained-result refresh—were verified as immediate on `examples/bad-ish-solid`. The browser console remained free of errors during the primary overview → file → finding/path → refresh journey.

Run selected sizes explicitly:

```sh
pnpm benchmark:analysis -- 10000 50000
pnpm benchmark:analysis -- 200000
```
