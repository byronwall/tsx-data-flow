import { Show, createResource } from "solid-js";
import { fetchWorkspace } from "./api";
import { ReportTabs, Shell } from "./Layout";
import { LoadingStatus } from "./LoadingStatus";
import { DataTrajectoriesWorkspace } from "./overview/DataTrajectoriesWorkspace";

export function TrajectoriesPage(props: { location: URL }) {
  const [response] = createResource(fetchWorkspace);
  return <Shell wide viewportBound context={response.error ? "" : response()?.data.workspace.displayRoot ?? ""} tabs={() => <ReportTabs active={null} page="trajectories" />}>
    <Show when={!response.error} fallback={<p class="error" role="alert">{response.error?.message ?? "Unable to load the workspace."}</p>}>
      <Show when={!response.loading} fallback={<LoadingStatus subject="workspace analysis" operation="workspace" isPending={() => response.loading} />}>
        <Show when={response()?.data}>{(workspace) => <DataTrajectoriesWorkspace inventory={workspace().routeData} generation={response()?.generation ?? 0} initialSearch={props.location.search} />}</Show>
      </Show>
    </Show>
  </Shell>;
}
