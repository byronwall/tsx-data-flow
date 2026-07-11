import { For, Show, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { FILE_VIEWS, REPORT_VIEWS, labelFor } from "./view-config";
import type { FileView, ReportView } from "./view-config";

export function Shell(props: {
  context?: string;
  beforeContext?: JSX.Element;
  actions?: JSX.Element;
  tabs?: JSX.Element;
  wide?: boolean;
  children: JSX.Element;
}) {
  let headerRef: HTMLElement | undefined;

  onMount(() => {
    const updateTopbarHeight = () => {
      const height = headerRef?.getBoundingClientRect().height ?? 0;
      document.documentElement.style.setProperty(
        "--topbar-height",
        `${Math.ceil(height)}px`,
      );
    };
    updateTopbarHeight();
    window.addEventListener("resize", updateTopbarHeight);
    const observer =
      "ResizeObserver" in window
        ? new ResizeObserver(updateTopbarHeight)
        : null;
    if (observer && headerRef) observer.observe(headerRef);
    onCleanup(() => {
      window.removeEventListener("resize", updateTopbarHeight);
      observer?.disconnect();
    });
  });

  return (
    <>
      <header class="topbar" ref={headerRef}>
        <div class="topbar-bar">
          <div class="topbar-identity">
            <a class="brand" href="/">
              tsx-dataflow
            </a>
            {props.beforeContext}
            <Show when={props.context}>
              <span class="topbar-context" title={props.context}>
                {props.context}
              </span>
            </Show>
          </div>
          <Show when={props.actions}>
            <div class="topbar-actions">{props.actions}</div>
          </Show>
        </div>
        {props.tabs}
      </header>
      <div class="layout">
        <main classList={{ wide: props.wide }}>{props.children}</main>
      </div>
    </>
  );
}

export function ReportTabs(props: { active: ReportView | null }) {
  const active = () => props.active;
  return (
    <nav class="report-tabs" aria-label="Workspace reports">
      <a class="report-tab" classList={{ active: !active() }} href="/">
        Overview
      </a>
      <For each={REPORT_VIEWS}>
        {(view: string) => (
          <a
            class="report-tab"
            classList={{ active: active() === view }}
            href={`/report?view=${encodeURIComponent(view)}`}
            aria-current={active() === view ? "page" : undefined}
          >
            {labelFor(view)}
          </a>
        )}
      </For>
    </nav>
  );
}

export function FileTabs(props: { path: string; active: FileView | null }) {
  const base = () => `/file?path=${encodeURIComponent(props.path)}`;
  const active = () => props.active;
  return (
    <nav class="report-tabs" aria-label="File sections">
      <a class="report-tab" classList={{ active: !active() }} href={base()}>
        Code map
      </a>
      <For each={FILE_VIEWS}>
        {(view: string) => (
          <a
            class="report-tab"
            classList={{ active: active() === view }}
            href={`${base()}&view=${encodeURIComponent(view)}`}
            aria-current={active() === view ? "page" : undefined}
          >
            {labelFor(view)}
          </a>
        )}
      </For>
    </nav>
  );
}


