# Concepts

Shared domain vocabulary for this project -- entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

## tsx-dataflow Reports

### Render Path
A static data-flow chain from a source value through transformations to the JSX or UI output that consumes it.

### Source
An input value at the edge of a render path, such as a prop, signal, helper return value, resource, or unresolved external value.

### Sink
The UI-facing endpoint of a render path: a rendered value, JSX attribute, style value, render-control expression, event handler, or endpoint-like output depending on the report view.

### Finding
A ranked analyzer result tied to a specific sink and source-to-sink path, used as a review target in the HTML server and markdown reports.

### Code Map
The HTML server view that overlays analyzer findings and path evidence onto source code so a reader can inspect report evidence next to the relevant lines.

### Source Peek
A click-to-reveal source preview for a file-and-line reference in report HTML.

Source Peek overlays should escape scrollable report containers by rendering the visible popover as a body-level fixed portal clamped to the viewport.
