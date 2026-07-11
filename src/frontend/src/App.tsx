import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { render } from "solid-js/web";
import { STYLE } from "../../html/styles";
import { FilePage } from "./FilePage";
import { OverviewPage } from "./OverviewPage";
import type { Navigate } from "./OverviewPage";
import { ReportPage } from "./ReportPage";
import { installPopoverController } from "./popover-controller";
import "./style.css";

const style = document.createElement("style");
style.textContent = STYLE;
document.head.appendChild(style);

function App() {
  const [location, setLocation] = createSignal(currentLocation());

  const navigate: Navigate = (href, replace = false) => {
    const next = new URL(href, window.location.origin);
    if (replace) window.history.replaceState({}, "", next);
    else window.history.pushState({}, "", next);
    setLocation(currentLocation());
  };

  onMount(() => {
    const onPop = () => setLocation(currentLocation());
    window.addEventListener("popstate", onPop);
    const removePopoverController = installPopoverController(document);
    onCleanup(() => {
      window.removeEventListener("popstate", onPop);
      removePopoverController();
    });
  });

  const onDocumentClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (
    event,
  ) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("/api/") ||
      href.startsWith("http") ||
      href.startsWith("mailto:")
    )
      return;
    if (anchor.hasAttribute("download") || anchor.target) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <div onClick={onDocumentClick}>
      <Router location={location()} navigate={navigate} />
    </div>
  );
}

function Router(props: { location: URL; navigate: Navigate }) {
  const path = () => props.location.pathname;
  return (
    <Show
      when={path() === "/file"}
      fallback={
        <Show
          when={path() === "/report"}
          fallback={
            <OverviewPage location={props.location} navigate={props.navigate} />
          }
        >
          <ReportPage location={props.location} />
        </Show>
      }
    >
      <FilePage location={props.location} />
    </Show>
  );
}

function currentLocation(): URL {
  return new URL(window.location.href);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
render(() => <App />, root);
