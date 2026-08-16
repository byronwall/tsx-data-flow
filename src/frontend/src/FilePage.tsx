import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import type { FilePage as FilePageData } from "../../api/contracts";
import { fetchFilePage, fetchReport, fetchWorkspace, refreshFailureMessage, refreshWorkspace } from "./api";
import { CodeMap } from "./CodeMap";
import { PageNav, Shell } from "./Layout";
import { LoadingStatus } from "./LoadingStatus";
import { FILE_VIEWS, labelFor } from "./view-config";
import type { FileView } from "./view-config";
import { NativeReport } from "./ReportPage";
import { FileWorldContext } from "./code-map/FileWorldContext";
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
  const [workspace] = createResource(fetchWorkspace);
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
      tabs={() => <PageNav active={activeView() ?? "code-map"} path={relPath()} repositoryLabel={workspace()?.data.workspace.displayRoot} />}
      wide
    >
      <Show when={relPath()}>
        <FileContextHeader
          path={relPath()}
          worldContext={fileData()?.data.worldContext}
          refreshing={refreshing()}
          onRefresh={() => void refresh()}
        />
      </Show>
      <Show when={refreshError()}><p class="error" role="alert">{refreshError()}</p></Show>
      <Show when={refreshing()}><LoadingStatus subject="file analysis" operation="refresh" isPending={() => refreshing()} /></Show>
      <Show when={relPath()} fallback={
        <Show when={!workspace.error} fallback={<p class="error" role="alert">{workspace.error?.message ?? "Unable to load the file list."}</p>}>
          <Show when={!workspace.loading} fallback={<LoadingStatus subject="workspace files" operation="workspace" isPending={() => workspace.loading} />}>
            <Show when={workspace()?.data} fallback={<p class="error" role="alert">Unable to load the file list.</p>}>
              {(data) => <FilePicker files={data().files} navigate={props.navigate} />}
            </Show>
          </Show>
        </Show>
      }>
        <Show
          when={!fileData.error}
          fallback={<p class="error" role="alert">{fileData.error?.message ?? "Unable to load file."}</p>}
        >
        <Show
          when={!fileData.loading}
          fallback={<LoadingStatus subject="file analysis" operation="file" isPending={() => fileData.loading} />}
        >
          <Show
            when={activeView()}
            fallback={
              <>
                <CodeMap
                  location={props.location}
                  data={fileData()!.data}
                  navigate={props.navigate}
                  requestedId={props.location.searchParams.get("expression") ?? props.location.searchParams.get("finding")}
                />
              </>
            }
          >
            <h2>{labelFor(activeView())}</h2>
            <Show
              when={!structuredReport.loading}
              fallback={<LoadingStatus subject="report" operation="report" isPending={() => structuredReport.loading} />}
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

function FilePicker(props: { files: Array<{ path: string }>; navigate: Navigate }) {
  return (
    <section class="file-picker" aria-labelledby="file-picker-title">
      <h1 id="file-picker-title">Code map</h1>
      <p class="meta">Select a file to inspect its source and data-flow evidence.</p>
      <label for="file-picker-select">File</label>
      <select id="file-picker-select" value="" onChange={(event) => {
        const path = event.currentTarget.value;
        if (path) props.navigate(`/file?path=${encodeURIComponent(path)}`);
      }}>
        <option value="" disabled>Select a file…</option>
        <For each={props.files}>{(file) => <option value={file.path}>{file.path}</option>}</For>
      </select>
      <Show when={!props.files.length}><p class="meta">No files are available in this workspace.</p></Show>
    </section>
  );
}

function FileContextHeader(props: {
  path: string;
  worldContext?: FilePageData["worldContext"];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const parts = createMemo(() => {
    const separator = props.path.lastIndexOf("/");
    return {
      directory: separator >= 0 ? props.path.slice(0, separator + 1) : "",
      name: separator >= 0 ? props.path.slice(separator + 1) : props.path,
    };
  });
  return (
    <div class="file-page-context">
      <div class="topbar-identity">
        <span class="topbar-context" title={props.path}>
          <span class="topbar-directory">{parts().directory}</span>
          <strong class="topbar-file">{parts().name}</strong>
        </span>
        <Show when={props.worldContext}>
          {(context) => <FileWorldContext context={context()} />}
        </Show>
      </div>
      <div class="topbar-actions">
        <a class="btn" href={`/api/file?path=${encodeURIComponent(props.path)}`}>JSON</a>
        <button type="button" disabled={props.refreshing} onClick={() => props.onRefresh()}>{props.refreshing ? "Analyzing…" : "↻ Re-analyze"}</button>
      </div>
    </div>
  );
}

// Code-map and report rendering are native Solid components over validated DTOs.
