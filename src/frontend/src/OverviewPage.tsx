import { Show, createMemo, createResource, createSignal } from "solid-js";
import { fetchWorkspace, refreshFailureMessage, refreshWorkspace } from "./api";
import { ReportTabs, Shell } from "./Layout";
import { LoadingStatus } from "./LoadingStatus";
import { entryTypeCountsByFile, overviewRows, overviewState } from "./overview-model";
import { OverviewControls } from "./overview/OverviewControls";
import { OverviewResults, PAGE_SIZE } from "./overview/OverviewResults";
import type { Navigate } from "./router";

export function OverviewPage(props: { location: URL; navigate: Navigate }) {
  const [response, { refetch }] = createResource(fetchWorkspace);
  const report = () => response()?.data; const [refreshing, setRefreshing] = createSignal(false); const [refreshError, setRefreshError] = createSignal("");
  const state = createMemo(() => overviewState(props.location.searchParams)); const rows = createMemo(() => overviewRows(report(), state()));
  const pageRows = createMemo(() => rows().slice((state().page - 1) * PAGE_SIZE, state().page * PAGE_SIZE));
  const refresh = async () => { setRefreshing(true); setRefreshError(""); try { await refreshWorkspace(); await refetch(); } catch (error) { setRefreshError(refreshFailureMessage(error)); } finally { setRefreshing(false); } };
  return <Shell wide context={response.error ? "" : report()?.workspace.displayRoot ?? ""} tabs={() => <ReportTabs active={null} />}><Show when={!response.error} fallback={<p class="error" role="alert">{response.error?.message ?? "Unable to load the workspace."}</p>}><Show when={!response.loading} fallback={<LoadingStatus subject="workspace analysis" operation="workspace" isPending={() => response.loading} />}>
    <div class="toolbar"><h1 style={{ margin: "0" }}>Render-path overview</h1><button type="button" disabled={refreshing()} onClick={() => void refresh()}>{refreshing() ? "Analyzing…" : "↻ Re-analyze"}</button></div>
    <Show when={refreshError()}><p class="error" role="alert">{refreshError()}</p></Show>
    <Show when={refreshing()}><LoadingStatus subject="workspace analysis" operation="refresh" isPending={() => refreshing()} /></Show>
    <Show when={report()}>{(workspace) => <><OverviewControls state={state()} navigate={props.navigate} /><OverviewResults report={workspace()} generation={response()?.generation} initialSearch={props.location.search} state={state()} rows={rows()} pageRows={pageRows()} typeCounts={entryTypeCountsByFile(workspace())} selectedAreaId={props.location.searchParams.get("area")} /></>}</Show>
  </Show></Show></Shell>;
}
