import { OVERVIEW_FILTERS, OVERVIEW_SORTS } from "./overview-config.mjs";

export function overviewState(url) {
  const q = (url.searchParams.get("q") ?? "").trim();
  const filter = url.searchParams.get("filter") ?? "all";
  const sort = url.searchParams.get("sort") ?? "burden";
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
  );
  return {
    q,
    filter: OVERVIEW_FILTERS.has(filter) ? filter : "all",
    sort: OVERVIEW_SORTS.has(sort) ? sort : "burden",
    page,
    all: url.searchParams.get("all") === "1",
  };
}

export function overviewHref(state, changes = {}) {
  const next = { ...state, ...changes };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.filter && next.filter !== "all") params.set("filter", next.filter);
  if (next.sort && next.sort !== "burden") params.set("sort", next.sort);
  if (next.all) params.set("all", "1");
  else if (next.page && next.page !== 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

// Build an href from the current URL, overriding/deleting the given query params
// and keeping everything else -- so a control can change one bit of state (the
// selected fan-out, the sort) without dropping the rest (INTENT section 5: state in URL).
export function paramHref(url, overrides) {
  const next = new URL(url.href);
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) next.searchParams.delete(key);
    else next.searchParams.set(key, String(value));
  }
  return `${next.pathname}${next.search}`;
}
