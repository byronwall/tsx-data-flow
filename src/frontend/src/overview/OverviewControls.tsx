import { For, createEffect, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { readHiddenColumns, writeHiddenColumns } from "../client-state";
import { overviewHref, type EntryCountKey, type OverviewFilter, type OverviewSort, type OverviewState } from "../overview-model";

type ToggleOption<T extends string = string> = readonly [T, string];
export const TYPE_COLUMNS = [
  { key: "boundaries", col: "boundaries", label: "Boundaries" }, { key: "fanOut", col: "fanout", label: "Fan-out" },
  { key: "relays", col: "relays", label: "Relays" }, { key: "unknown", col: "unknown", label: "Unknown" },
] as const satisfies ReadonlyArray<{ key: EntryCountKey; col: string; label: string }>;
const FILTER_OPTIONS = [["all", "All"], ["findings", "Findings"], ["unknown", "Unknown edges"], ["participating", "Graph participants"]] as const satisfies readonly ToggleOption<OverviewFilter>[];
const SORT_OPTIONS = [["burden", "Burden"], ["findings", "Findings"], ["depth", "Depth"], ["file", "Path"]] as const satisfies readonly ToggleOption<OverviewSort>[];

export function OverviewControls(props: { state: OverviewState; navigate: (href: string, replace?: boolean) => void }) {
  let searchInput!: HTMLInputElement;
  const submit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (event) => { event.preventDefault(); props.navigate(overviewHref(props.state, { q: searchInput.value.trim(), page: 1 })); };
  return <>
    <div class="toolbar"><form onSubmit={submit}><input ref={searchInput} name="q" type="search" value={props.state.q} placeholder="Search files and reports" /><button type="submit">Search</button></form>
      <ToggleLinks label="Show" value={props.state.filter} options={FILTER_OPTIONS} hrefFor={(value) => overviewHref(props.state, { filter: value, page: 1 })} />
      <ToggleLinks label="Sort" value={props.state.sort} options={SORT_OPTIONS} hrefFor={(value) => overviewHref(props.state, { sort: value, page: 1 })} />
      <a class="btn" href="/">Reset</a>
    </div><ColumnToggle />
  </>;
}
function ToggleLinks<T extends string>(props: { label: string; value: T; options: readonly ToggleOption<T>[]; hrefFor(value: T): string }) {
  return <div class="overview-toggle-group" role="group" aria-label={props.label}><span class="meta">{props.label}</span><For each={props.options}>{([value, label]) => <a class="overview-toggle" aria-pressed={value === props.value} href={props.hrefFor(value)}>{label}</a>}</For></div>;
}
function ColumnToggle() {
  const columns = TYPE_COLUMNS.map((column) => column.col); const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set());
  onMount(() => setHidden(readHiddenColumns(window.localStorage, columns)));
  createEffect(() => { const value = hidden(); const table = document.getElementById("overview-table"); if (table) for (const column of columns) table.classList.toggle(`hide-${column}`, value.has(column)); });
  const toggle: JSX.EventHandler<HTMLInputElement, InputEvent> = (event) => { const col = event.currentTarget.dataset.col; if (!col) return; const next = new Set(hidden()); if (event.currentTarget.checked) next.delete(col); else next.add(col); setHidden(next); writeHiddenColumns(window.localStorage, next); };
  return <fieldset class="col-toggle" aria-label="Show or hide columns"><span class="meta">Columns:</span><For each={TYPE_COLUMNS}>{(column) => <label><input type="checkbox" data-col={column.col} checked={!hidden().has(column.col)} onInput={toggle} /> {column.label}</label>}</For></fieldset>;
}
