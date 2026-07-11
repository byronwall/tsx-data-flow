import { Show, createMemo, createResource, createSignal } from "solid-js";
import { fetchFilePage, fetchReport, refreshFailureMessage, refreshWorkspace } from "./api";
import { CodeMap } from "./CodeMap";
import { FileTabs, Shell } from "./Layout";
import { FILE_VIEWS, labelFor } from "./view-config";
import type { FileView } from "./view-config";
import { NativeReport } from "./ReportPage";
import type { Navigate } from "./router";

export function FilePage(props: { location: URL; navigate: Navigate }) {
  const relPath = createMemo(
    () => props.location.searchParams.get("path") ?? "",
  );
  const activeView = createMemo<FileView | null>(() => {
    const view = props.location.searchParams.get("view");
    return view && FILE_VIEWS.includes(view as FileView)
      ? (view as FileView)
      : null;
  });
  const [fileData, { refetch: refetchFile }] = createResource(
    () => relPath(),
    async (path) => {
      if (!path) return null;
      return fetchFilePage(path);
    },
  );
  const [refreshing, setRefreshing] = createSignal(false);
  const [refreshError, setRefreshError] = createSignal("");
  const [structuredReport, { refetch: refetchReport }] = createResource(
    () => ({ path: relPath(), view: activeView() }),
    async ({ path, view }) => {
      if (!path || !view) return null;
      return fetchReport(view, path);
    },
  );
  const refresh = async () => {
    setRefreshing(true); setRefreshError("");
    try { await refreshWorkspace(); await Promise.all([refetchFile(), refetchReport()]); }
    catch (error) { setRefreshError(refreshFailureMessage(error)); }
    finally { setRefreshing(false); }
  };

  return (
    <Shell
      context={relPath()}
      actions={() =>
        <>
          <a
            class="btn"
            href={`/api/file?path=${encodeURIComponent(relPath())}`}
          >
            JSON
          </a>
          <button type="button" disabled={refreshing()} onClick={() => void refresh()}>{refreshing() ? "Analyzing…" : "↻ Re-analyze"}</button>
        </>
      }
      tabs={() => <FileTabs path={relPath()} active={activeView()} />}
      wide
    >
      <Show when={refreshError()}><p class="error" role="alert">{refreshError()}</p></Show>
      <Show when={relPath()} fallback={<p class="meta">Missing ?path.</p>}>
        <Show
          when={!fileData.error}
          fallback={<p class="error" role="alert">{fileData.error?.message ?? "Unable to load file."}</p>}
        >
        <Show
          when={!fileData.loading}
          fallback={<p class="meta">Loading file...</p>}
        >
          <Show
            when={activeView()}
            fallback={
              <>
                <CodeMap
                  location={props.location}
                  data={fileData()!.data}
                  navigate={props.navigate}
                  requestedId={props.location.searchParams.get("finding")}
                />
              </>
            }
          >
            <h2>{labelFor(activeView())}</h2>
            <Show
              when={!structuredReport.loading}
              fallback={<p class="meta">Loading report...</p>}
            >
              <Show when={structuredReport()?.data} fallback={<p class="meta">No report data.</p>}>
                {(data) => <NativeReport data={data()} location={props.location} navigate={props.navigate} />}
              </Show>
            </Show>
          </Show>
        </Show>
        </Show>
      </Show>
    </Shell>
  );
}

// Code-map and report rendering are native Solid components over validated DTOs.
