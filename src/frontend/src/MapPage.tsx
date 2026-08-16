import { Show, createResource, createSignal } from "solid-js";
import { fetchWorkspace, refreshFailureMessage, refreshWorkspace } from "./api";
import { ReportTabs, Shell } from "./Layout";
import { LoadingStatus } from "./LoadingStatus";
import { WorldMap } from "./overview/WorldMap";

export function MapPage(props: { location: URL }) {
  const [response, { refetch }] = createResource(fetchWorkspace);
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshError, setRefreshError] = createSignal("");
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError("");
    try { await refreshWorkspace(); await refetch(); }
    catch (error) { setRefreshError(refreshFailureMessage(error)); }
    finally { setRefreshing(false); }
  };
  return <Shell wide context={response.error ? "" : response()?.data.workspace.displayRoot ?? ""} tabs={() => <ReportTabs active={null} page="map" />}>
    <div class="toolbar"><h1 style={{ margin: "0" }}>World map</h1><button type="button" disabled={refreshing()} onClick={() => void refresh()}>{refreshing() ? "Analyzing…" : "↻ Re-analyze"}</button></div>
    <Show when={refreshError()}><p class="error" role="alert">{refreshError()}</p></Show>
    <Show when={refreshing()}><LoadingStatus subject="workspace analysis" operation="refresh" isPending={() => refreshing()} /></Show>
    <Show when={!response.error} fallback={<p class="error" role="alert">{response.error?.message ?? "Unable to load the workspace."}</p>}>
      <Show when={!response.loading} fallback={<LoadingStatus subject="workspace analysis" operation="workspace" isPending={() => response.loading} />}>
        <Show when={response()?.data}>{(workspace) => <WorldMap map={workspace().semanticMap} initialSelectedAreaId={props.location.searchParams.get("area")} />}</Show>
      </Show>
    </Show>
  </Shell>;
}
