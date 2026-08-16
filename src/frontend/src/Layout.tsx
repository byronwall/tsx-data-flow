import { For, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import type { ReportView } from "../../api/report-views";
import { BROWSER_REPORT_VIEWS, labelFor } from "./view-config";

export function Shell(props: {
  tabs?: () => JSX.Element;
  wide?: boolean;
  viewportBound?: boolean;
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
        {props.tabs?.()}
      </header>
      <div class="layout">
        <main classList={{ wide: props.wide, "viewport-bound": props.viewportBound }}>{props.children}</main>
      </div>
    </>
  );
}

export type PageNavPage = "overview" | "code-map" | "map" | "trajectories" | ReportView;
type PageNavItem = { label: string; href: string; active: boolean };

export function PageNav(props: { active: PageNavPage; path?: string; repositoryLabel?: string }) {
  const active = () => props.active;
  const path = () => props.path?.trim() ?? "";
  const codeMapHref = () => path() ? `/file?path=${encodeURIComponent(path())}` : "/file";
  const reportHref = (view: ReportView) => path()
    ? `${codeMapHref()}&view=${encodeURIComponent(view)}`
    : `/report?view=${encodeURIComponent(view)}`;
  const items = (): PageNavItem[] => [
    { label: "Overview", href: "/", active: active() === "overview" },
    { label: "Code map", href: codeMapHref(), active: active() === "code-map" },
    { label: "World map", href: "/map", active: active() === "map" },
    { label: "Data trajectories", href: "/trajectories", active: active() === "trajectories" },
    ...BROWSER_REPORT_VIEWS.map((view) => ({
      label: labelFor(view),
      href: reportHref(view),
      active: active() === view,
    })),
  ];
  return (
    <div class="page-nav-row">
      <nav class="report-tabs" aria-label="Workspace views">
        <For each={items()}>
          {(item) => (
            <a
              class="report-tab"
              classList={{ active: item.active }}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
            >
              {item.label}
            </a>
          )}
        </For>
      </nav>
      <span
        class="page-nav-repository"
        classList={{ "is-empty": !props.repositoryLabel }}
        title={props.repositoryLabel}
      >
        {props.repositoryLabel ?? ""}
      </span>
    </div>
  );
}
