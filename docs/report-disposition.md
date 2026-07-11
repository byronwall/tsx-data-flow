# Browser report disposition

The code map is the primary review surface. Reports are retained only when they provide a distinct useful workflow.

| View | Disposition | Browser surface |
|---|---|---|
| Findings | Migrate | Structured list linked to source |
| Work packets | Migrate | Structured shared-cause cards |
| Fan-out | Migrate | Semantic Solid SVG |
| Fan-in | Migrate | Semantic Solid SVG |
| Path families | Migrate | Structured family cards |
| Defensive ledger | Migrate | Structured defense cards |
| Prop relay | Migrate | Semantic Solid SVG |
| Context relay | Migrate | Context/prop evidence cards |
| Boundary report | Migrate | Semantic Solid SVG |
| Component references | Migrate | Definition/use cards |
| Repeated forks | Merge | Unified file inventory and source annotations |
| Junctions | Merge | Unified boundary inventory entries |
| Inline preview | Merge | Boundary details in the file explorer |
| Overview report | Merge | Interactive workspace overview |

All views retain direct Markdown downloads. Merged views return an explicit structured disposition from `/api/reports/:view`; no browser view parses Markdown or generated HTML.
