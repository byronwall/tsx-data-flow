/* eslint-disable solid/no-innerhtml -- Markdown renderer escapes inserted content. */
import type { AnalysisReport } from "../../types";
import { Show, createMemo, createResource } from "solid-js";
import { markdownToHtml } from "../../html/markdown-to-html";
import { fetchJson, fetchText } from "./api";
import { CodeMap } from "./CodeMap";
import { FileTabs, Shell } from "./Layout";
import { FILE_VIEWS, labelFor } from "./view-config";
import type { FileView } from "./view-config";

type Report = AnalysisReport;

export function FilePage(props: { location: URL }) {
  const relPath = createMemo(
    () => props.location.searchParams.get("path") ?? "",
  );
  const activeView = createMemo<FileView | null>(() => {
    const view = props.location.searchParams.get("view");
    return view && FILE_VIEWS.includes(view as FileView)
      ? (view as FileView)
      : null;
  });
  const [fileData] = createResource(
    () => relPath(),
    async (path) => {
      if (!path) return null;
      const [report, fullReport, source] = await Promise.all([
        fetchJson<Report>(`/api/report.json?path=${encodeURIComponent(path)}`),
        fetchJson<Report>("/api/report.json"),
        fetchText(`/api/source?path=${encodeURIComponent(path)}`),
      ]);
      return { report, fullReport, source };
    },
  );
  const [markdown] = createResource(
    () => ({ path: relPath(), view: activeView() }),
    async ({ path, view }) => {
      if (!path || !view) return "";
      return fetchText(
        `/api/report.${encodeURIComponent(view)}.md?path=${encodeURIComponent(path)}`,
      );
    },
  );

  return (
    <Shell
      context={relPath()}
      beforeContext={
        <a class="topbar-back" href="/">
          ← Overview
        </a>
      }
      actions={
        <>
          <a
            class="btn"
            href={`/api/report.json?path=${encodeURIComponent(relPath())}`}
          >
            JSON
          </a>
          <form action="/refresh" method="post">
            <input
              type="hidden"
              name="from"
              value={`/file?path=${encodeURIComponent(relPath())}`}
            />
            <button type="submit">↻ Re-analyze</button>
          </form>
        </>
      }
      tabs={<FileTabs path={relPath()} active={activeView()} />}
      wide
    >
      <Show when={relPath()} fallback={<p class="meta">Missing ?path.</p>}>
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
                  relPath={relPath()}
                  source={fileData()?.source ?? ""}
                  report={fileData()?.report}
                  fullReport={fileData()?.fullReport}
                />
              </>
            }
          >
            <h2>{labelFor(activeView())}</h2>
            <Show
              when={!markdown.loading}
              fallback={<p class="meta">Loading report...</p>}
            >
              <div class="body" innerHTML={markdownToHtml(markdown() ?? "")} />
            </Show>
          </Show>
        </Show>
      </Show>
    </Shell>
  );
}

// Code-map rendering and browser interactions live in the focused CodeMap component.
// Network viewer serialization lives in viewer-renderers.ts.

