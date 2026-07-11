/* eslint-disable solid/no-innerhtml -- Markdown and viewer renderers escape inserted content. */
import type { AnalysisReport } from "../../types";
import { Show, createMemo, createResource } from "solid-js";
import { markdownToHtml } from "../../html/markdown-to-html";
import { fetchJson, fetchText } from "./api";
import { ReportTabs, Shell } from "./Layout";
import { isReportView, labelFor } from "./view-config";
import type { ReportView } from "./view-config";
import {
  renderBoundaryViewer,
  renderFanInViewer,
  renderFanOutViewer,
  renderJunctionViewer,
  renderPropRelayViewer,
} from "./viewer-renderers";

type Report = AnalysisReport;

export function ReportPage(props: { location: URL }) {
  const view = createMemo<ReportView>(() => {
    const nextView = props.location.searchParams.get("view");
    return isReportView(nextView) ? nextView : "overview";
  });
  const [report] = createResource(
    () => view(),
    (nextView) => fetchText(`/api/report.${encodeURIComponent(nextView)}.md`),
  );
  const [meta] = createResource(
    () => props.location.search,
    () => fetchJson<Report>("/api/report.json"),
  );
  const fanOutHtml = createMemo(() => {
    if (view() !== "fan-out") return "";
    return renderFanOutViewer(meta(), props.location);
  });
  const boundaryHtml = createMemo(() => {
    if (view() !== "boundary-report") return "";
    return renderBoundaryViewer(meta(), props.location);
  });
  const fanInHtml = createMemo(() => {
    if (view() !== "fan-in") return "";
    return renderFanInViewer(meta(), props.location);
  });
  const junctionHtml = createMemo(() => {
    if (view() !== "junctions") return "";
    return renderJunctionViewer(meta(), props.location);
  });
  const propRelayHtml = createMemo(() => {
    if (view() !== "prop-relay") return "";
    return renderPropRelayViewer(meta(), props.location);
  });
  const networkHtml = createMemo(
    () =>
      fanOutHtml() ||
      boundaryHtml() ||
      fanInHtml() ||
      junctionHtml() ||
      propRelayHtml(),
  );
  const markdownHtml = createMemo(() => markdownToHtml(report() ?? ""));
  return (
    <Shell
      context={meta()?.meta?.root ?? ""}
      tabs={<ReportTabs active={view()} />}
    >
      <div class="toolbar">
        <h1 style={{"margin":"0"}}>{labelFor(view())}</h1>
        <a class="btn" href={`/api/report.${encodeURIComponent(view())}.md`}>
          Markdown
        </a>
      </div>
      <Show
        when={!report.loading}
        fallback={<p class="meta">Loading report...</p>}
      >
        <Show
          when={networkHtml()}
          fallback={<div class="body" innerHTML={markdownHtml()} />}
        >
          <div class="body">
            <div innerHTML={networkHtml()} />
            <section class="md-mirror" aria-label="Markdown report">
              <div innerHTML={markdownHtml()} />
            </section>
          </div>
        </Show>
      </Show>
    </Shell>
  );
}


