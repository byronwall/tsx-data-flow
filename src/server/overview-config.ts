// OVERVIEW-1: the optional per-type count columns the user can show/hide. `key`
// matches the entryTypeCountsByFile field; `col` is the CSS/toggle id. Findings
// is always-on (it is the primary signal) so it is not in this list.
export const OVERVIEW_TYPE_COLUMNS = [
  { key: "boundaries", col: "boundaries", label: "Boundaries" },
  { key: "fanOut", col: "fanout", label: "Fan-out" },
  { key: "relays", col: "relays", label: "Relays" },
  { key: "unknown", col: "unknown", label: "Unknown" },
];

export const OVERVIEW_FILTERS = new Set([
  "all",
  "findings",
  "unknown",
  "participating",
]);
export const OVERVIEW_SORTS = new Set(["burden", "findings", "depth", "file"]);
export const OVERVIEW_PAGE_SIZE = 25;

// Heading reflects the active sort so it never lies (it was hard-coded "by burden").
export const SORT_HEADING = {
  burden: "Files by burden",
  findings: "Files by finding count",
  depth: "Files by path depth",
  file: "Files by path",
};
