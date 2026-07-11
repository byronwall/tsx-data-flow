import { For, Match, Show, Switch, createMemo, createResource, createSignal, untrack } from "solid-js";
import type { ReportData } from "../../api/contracts";
import type { ReportView } from "../../api/report-views";
import { fetchReport, refreshFailureMessage, refreshWorkspace } from "./api";
import { ReportTabs, Shell } from "./Layout";
import { isReportView, labelFor } from "./view-config";
import { SemanticGraph } from "./reports/SemanticGraph";
import type { Navigate } from "./router";

export function ReportPage(props: { location: URL; navigate: Navigate }) {
  const view = createMemo<ReportView>(() => { const value = props.location.searchParams.get("view"); return isReportView(value) ? value : "findings"; });
  const [response, { refetch }] = createResource(() => view(), (next) => next === "overview" ? Promise.resolve(null) : fetchReport(next));
  const [refreshing, setRefreshing] = createSignal(false); const [refreshError, setRefreshError] = createSignal("");
  const refresh = async () => { setRefreshing(true); setRefreshError(""); try { await refreshWorkspace(); await refetch(); } catch (error) { setRefreshError(refreshFailureMessage(error)); } finally { setRefreshing(false); } };
  return <Shell context="Workspace reports" tabs={() => <ReportTabs active={view()} />}>
    <div class="toolbar"><h1 style={{ margin: "0" }}>{labelFor(view())}</h1><a class="btn" href={`/api/report.${encodeURIComponent(view())}.md`}>Markdown</a><button type="button" disabled={refreshing()} onClick={() => void refresh()}>{refreshing() ? "Analyzing…" : "↻ Re-analyze"}</button></div>
    <Show when={refreshError()}><p class="error" role="alert">{refreshError()}</p></Show>
    <Show when={view() !== "overview"} fallback={<p><a href="/">Open the interactive overview.</a></p>}>
      <Show when={!response.error} fallback={<p class="error" role="alert">{response.error?.message ?? "Unable to load report."}</p>}><Show when={!response.loading} fallback={<p class="meta">Loading report…</p>}>
        <Show when={response()?.data} fallback={<p class="error">Unable to load report.</p>}>{(data) => <NativeReport data={data()} location={props.location} navigate={props.navigate} />}</Show>
      </Show></Show>
    </Show>
  </Shell>;
}

export function NativeReport(props: { data: ReportData; location?: URL; navigate?: Navigate }) {
  return <div class="native-report"><Switch>
    <Match when={props.data.view === "fan-out" || props.data.view === "fan-in" || props.data.view === "prop-relay" || props.data.view === "boundary-report"}>
      <GraphReport data={props.data as Extract<ReportData, { view: "fan-out" | "fan-in" | "prop-relay" | "boundary-report" }>} location={props.location} navigate={props.navigate} />
    </Match>
    <Match when={props.data.view === "context-relay"}><ContextRelayReport data={props.data as Extract<ReportData, { view: "context-relay" }>} /></Match>
    <Match when={"disposition" in props.data}><p class="empty-state">{(props.data as Extract<ReportData, { disposition: "merged" }>).message}</p></Match>
    <Match when={true}><ListReport data={props.data} /></Match>
  </Switch></div>;
}

function GraphReport(props: { data: Extract<ReportData, { view: "fan-out" | "fan-in" | "prop-relay" | "boundary-report" }>; location?: URL; navigate?: Navigate }) {
  const [selected, setSelected] = createSignal(untrack(() => { const requested = props.location?.searchParams.get("item"); return props.data.items.some((entry) => entry.id === requested) ? requested! : props.data.items[0]?.id ?? ""; }));
  const active = createMemo(() => props.data.items.find((item) => item.id === selected()) ?? props.data.items[0]);
  return <Show when={active()} fallback={<p class="meta">No qualifying entries.</p>}>{(item) => <>
    <label class="report-picker">Inspect <select value={item().id} onChange={(event) => { const id = event.currentTarget.value; setSelected(id); if (props.navigate) { const url = new URL(window.location.href); url.searchParams.set("item", id); props.navigate(`${url.pathname}${url.search}`, true); } }}><For each={props.data.items}>{(entry) => <option value={entry.id}>{entry.label}</option>}</For></select></label>
    <section class="report-card"><h2>{item().label}</h2><SemanticGraph graph={item().graph} label={`${props.data.view} graph for ${item().label}`} /></section>
  </>}</Show>;
}
function ContextRelayReport(props: { data: Extract<ReportData, { view: "context-relay" }> }) { return <div class="report-grid"><For each={props.data.items}>{(item) => <article class="report-card"><h3><a href={`/file?path=${encodeURIComponent(item.location?.path ?? "")}#L${item.location?.line ?? 1}`}>{item.label}</a></h3><p>{item.signal} · score {item.score}</p><p><strong>Context:</strong> {item.contextHooks.join(", ") || "—"}</p><p><strong>Relayed props:</strong> {item.props.join(", ")}</p><Show when={item.sharedProps.length}><p><strong>Context-like props:</strong> {item.sharedProps.join(", ")}</p></Show></article>}</For></div>; }
function ListReport(props: { data: ReportData }) {
  const items = () => "items" in props.data ? props.data.items : [];
  return <Show when={items().length} fallback={<p class="meta">No qualifying entries.</p>}><div class="report-grid"><For each={items()}>{(item) => <article class="report-card"><h3>{"location" in item && item.location ? <a href={`/file?path=${encodeURIComponent(item.location.path)}#L${item.location.line}`}>{item.label}</a> : item.label}</h3><dl><For each={Object.entries(item).filter(([key]) => !["id", "label", "location", "graph"].includes(key))}>{([key, value]) => <><dt>{humanize(key)}</dt><dd>{format(value)}</dd></>}</For></dl></article>}</For></div></Show>;
}
function humanize(value: string) { return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()); }
function format(value: unknown): string { if (Array.isArray(value)) return value.map((entry) => typeof entry === "object" ? JSON.stringify(entry) : String(entry)).join(", ") || "—"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
