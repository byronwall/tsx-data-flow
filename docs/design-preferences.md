# Design preferences

Use this brief when designing or revising the analyzer UI. It records the preferred final direction for dense code-review surfaces such as the code map, finding details, inventories, and report tables.

## Overall direction

- Optimize for fast scanning and direct interaction. Dense information is welcome when its hierarchy is obvious.
- Prefer compact, structured layouts over loose cards or prose that appears splatted onto the page.
- Spend visual emphasis on information that changes a decision. Remove repeated source, repeated paths, repeated labels, and redundant metadata.
- Use small variations in background color to establish grouping. Keep the palette restrained; color should clarify structure, not decorate it.
- Make the most important code and analysis evidence visible without forcing horizontal scrolling or multi-click menus.

## Hierarchy and scrolling

- Keep navigation and identity outside independently scrolling detail bodies when they must remain available.
- Use a compact fixed header for the return action, selected finding name/category, and breadcrumb.
- Keep return controls terse when context is obvious, for example `← List` rather than `← Back to list`.
- Start the scrolling body with substantive content. Do not repeat the title or breadcrumb inside it.
- Put low-frequency actions in a quiet actions row at the bottom of the detail, not beside the title. Keep related actions left-aligned in one compact row with subtle separators.

## Code maps and gutters

- Put per-line activity indicators at the far left so they remain visible when source lines overflow horizontally.
- Give the indicator gutter a fixed, narrow width. Do not let annotation count expand the source layout.
- Preserve direct selection from line indicators and annotated source spans.
- Treat the source pane as the authoritative source display. Do not repeat a source excerpt in the adjacent finding detail when selection already scrolls the source into view.

## Finding details and paths

- Do not repeat the finding expression above the evidence when it is already visible in the selected source.
- Present a trace as one code line followed by its explanation, then its location.
- Combine adjacent trace operations that refer to the same source line. Render the source line once and keep each operation meaning underneath it.
- Put each operation kind—such as `property-read`, `fallback`, `call`, or `conditional`—on its own explanation line. Do not run several operations together as prose.
- Use subtle alternating row backgrounds to separate grouped path entries.
- Show one sequence number per displayed source line, not one visible number for every internal trace operation.
- Shorten repeated locations to `filename:line`; retain the full path in a tooltip or link target.
- Label recommendations explicitly. Suppress meaningless classification values such as `uncategorized`.

## Tables and inventories

- Use a real table or a table-shaped fixed grid for repeated records. Columns must line up across rows.
- Give stable fields fixed widths, for example Type, Line, Identifier, and Metric. Let the identifier column absorb remaining space and truncate cleanly.
- Add a quiet column header row so the meaning of each value is explicit.
- Right-align compact numeric metrics and keep line/metric formatting consistent.
- Color-code semantic types with restrained background fills so categories such as boundary, fan-out, fork, and finding are distinguishable at a glance.
- Use a subtle full-row background tint for secondary states such as defended. Do not use a side rail.

## Controls

- Prefer visible toggle buttons over select menus for small, frequently used option sets. A toggle should complete the choice in one click and expose all available choices without opening a menu.
- Use toggle groups for bounded filters and sorts such as entry type, defended state, priority, line, sources, and type.
- Show the active toggle with `aria-pressed` and a restrained background change.
- Allow toggle groups to wrap instead of hiding options or forcing horizontal overflow.
- Reserve select menus for long or infrequently used option sets where showing every choice would create more noise than value.

## Typography and labels

- Render code identifiers, expressions, filenames, and code-oriented secondary labels in monospace.
- Keep explanatory prose in the interface font so code and explanation are visually distinct.
- Prefer short, direct labels. Avoid repeating long file paths or restating the same risk, title, or expression in nearby regions.
- Use uppercase micro-labels sparingly for structural labels such as Type, Metric, Recommendation, or Actions.

## Color and borders

- Background color is sufficient to distinguish a filled badge, row, card, or callout.
- Never add a decorative left border, inset-left shadow, or pseudo-element rail to an element that already has a background fill.
- Avoid dark curved edges or colored side strips on filled chips and rows.
- Use ordinary separators only where they describe actual structure, such as the divider between a fixed header and a scrolling body or between table rows.

## Review checklist

- Can the user identify the selected item and return to the list without scrolling?
- Is every code name monospace and every explanation visually distinct from code?
- Are repeated records aligned to fixed columns?
- Are common filters and sorts one-click toggles?
- Is source or location information repeated unnecessarily?
- Are same-line path operations grouped without losing their individual meanings?
- Does color communicate grouping or type without an extra decorative left edge?
- Can long content truncate or scroll without hiding essential controls or indicators?
