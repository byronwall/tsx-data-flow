/* eslint-disable solid/no-innerhtml -- Server-generated code-map HTML is escaped before insertion. */
import type { AnalysisReport, Sink } from "../../types";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import type { JSX } from "solid-js";
import { renderCodeMap } from "../../html/code-map";
import { applyPathOverlay, clearPathOverlay } from "./code-map-interactions";
import { uniqueIds } from "./client-state";
import { fanOutEntriesForFile } from "./viewer-data";

type Report = AnalysisReport;

export function CodeMap(props: {
  location: URL;
  relPath: string;
  source: string;
  report?: Report | null;
  fullReport?: Report | null;
}) {
  let rootRef: HTMLDivElement | undefined;
  const initialFinding = untrack(() => props.location.searchParams.get("finding"));
  const [selectedIds, setSelectedIds] = createSignal<string[]>(
    initialFinding ? [initialFinding] : [],
  );
  const selected = () => selectedIds()[0] ?? null;
  const html = createMemo(() => {
    const report = props.report;
    const fullReport = props.fullReport ?? report;
    const sinks = (report?.sinks ?? []).filter(
      (sink: Sink) => sink.file === props.relPath,
    );
    return renderCodeMap({
      relPath: props.relPath,
      source: props.source,
      sinks,
      meta: report?.meta ?? {},
      resolveSource: () => null,
      selectedFinding: selected(),
      forks: (report?.repeatedForks ?? []).filter(
        (fork) => fork.file === props.relPath,
      ),
      helpers: (report?.helpers ?? []).filter(
        (helper) => helper.file === props.relPath,
      ),
      unknownEdges: (report?.unknownEdges ?? []).filter(
        (edge) => edge.file === props.relPath,
      ),
      relays: (report?.contextRelay ?? []).filter(
        (relay) => relay.parentFile === props.relPath,
      ),
      fanOut: fanOutEntriesForFile(fullReport?.sinks ?? [], props.relPath),
    });
  });

  const currentMap = () => rootRef?.querySelector(".codemap");

  const closePeeks = () => {
    rootRef
      ?.querySelectorAll(".peek.open")
      .forEach((peek) => peek.classList.remove("open"));
    document
      .querySelectorAll("body > .peek-pop.portal")
      .forEach((portal) => portal.remove());
  };

  const closePeekOnOutsideClick = (event: MouseEvent) => {
    if (
      event.target instanceof Element &&
      !event.target.closest(".peek-label, .peek-pop")
    ) {
      closePeeks();
    }
  };

  const closePeekOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") closePeeks();
  };

  onMount(() => {
    document.addEventListener("click", closePeekOnOutsideClick);
    document.addEventListener("keydown", closePeekOnEscape);
  });
  onCleanup(() => {
    document.removeEventListener("click", closePeekOnOutsideClick);
    document.removeEventListener("keydown", closePeekOnEscape);
    closePeeks();
  });

  const rowForLine = (line: string) =>
    currentMap()?.querySelector(`tr[data-line="${CSS.escape(line)}"]`);

  const jumpToLine = (line: string | undefined | null) => {
    if (!line) return;
    const row = rowForLine(line);
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("flash");
    window.setTimeout(() => row?.classList.remove("flash"), 850);

    const url = new URL(window.location.href);
    url.hash = `L${line}`;
    window.history.replaceState({}, "", url);
  };

  const reconcileSelectedFindings = (ids: string[]) => {
    const map = currentMap();
    if (!map) return;
    const panel = map.querySelector(".panel");
    const findings = uniqueIds(ids)
      .map((id) =>
        panel?.querySelector<HTMLElement>(
          `.finding[data-finding="${CSS.escape(id)}"]`,
        ),
      )
      .filter((finding): finding is HTMLElement => Boolean(finding));
    panel
      ?.querySelectorAll(".finding.active")
      .forEach((finding) => finding.classList.remove("active"));
    findings.forEach((finding) => finding.classList.add("active"));
    panel?.classList.toggle("show-detail", findings.length > 0);
    map
      .querySelectorAll(".hit.sel")
      .forEach((node) => node.classList.remove("sel"));

    const finding = findings[0] ?? null;
    applyPathOverlay(map, finding);
    if (!finding) return;
    finding.scrollIntoView({ block: "nearest" });
    const id = finding.dataset.finding ?? "";
    const hit = Array.from(map.querySelectorAll<HTMLElement>(".hit")).find(
      (node) => (node.dataset.findings ?? "").split(",").includes(id),
    );
    if (hit) {
      hit.classList.add("sel");
      hit.scrollIntoView({ block: "center" });
      return;
    }
    if (finding instanceof HTMLElement) jumpToLine(finding.dataset.sinkLine);
  };

  createEffect(() => {
    const nextFinding = props.location.searchParams.get("finding");
    const hashLine = props.location.hash.match(/^#L(\d+)$/)?.[1];
    setSelectedIds(nextFinding ? [nextFinding] : []);
    window.requestAnimationFrame(() => {
      if (nextFinding) reconcileSelectedFindings([nextFinding]);
      else if (hashLine) jumpToLine(hashLine);
    });
  });

  createEffect(() => {
    const ids = selectedIds();
    html();
    window.requestAnimationFrame(() => {
      const sortMode = new URL(window.location.href).searchParams.get("lsort");
      const findingList = currentMap()?.querySelector(".finding-list");
      if (sortMode && findingList instanceof HTMLElement) {
        sortFindingList(findingList, sortMode);
      }
      reconcileSelectedFindings(ids);
    });
  });

  const selectFindings = (ids: Iterable<string>) => {
    const nextIds = uniqueIds(ids);
    const id = nextIds[0] ?? null;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("finding", id);
    else url.searchParams.delete("finding");
    if (id) url.hash = "";
    window.history.replaceState({}, "", url);
    setSelectedIds(nextIds);
  };

  const copyDebugInfo = async (button: HTMLButtonElement) => {
    const finding = button.closest(".finding");
    const payload = finding?.querySelector(".debug-payload")?.textContent ?? "";
    const previousLabel = button.textContent;
    try {
      await copyText(payload);
      button.textContent = "Copied!";
      button.classList.add("ok");
    } catch (error) {
      console.error("Failed to copy debug info", error);
      button.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      button.textContent = previousLabel;
      button.classList.remove("ok");
    }, 1300);
  };

  const onCodeMapClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (
    event,
  ) => {
    if (!(event.target instanceof Element)) return;
    const copyButton = event.target.closest(".copy-debug");
    if (copyButton instanceof HTMLButtonElement) {
      event.preventDefault();
      event.stopPropagation();
      void copyDebugInfo(copyButton);
      return;
    }
    const peekLabel = event.target.closest(".peek-label");
    if (peekLabel instanceof HTMLElement) {
      const peek = peekLabel.closest(".peek");
      const popover = peek?.querySelector(".peek-pop");
      const wasOpen = peek?.classList.contains("open") ?? false;
      closePeeks();
      if (peek && popover instanceof HTMLElement && !wasOpen) {
        peek.classList.add("open");
        const portal = popover.cloneNode(true);
        if (portal instanceof HTMLElement) {
          portal.classList.add("portal", "open");
          document.body.appendChild(portal);
          positionPeek(peekLabel, portal);
        }
      }
      event.stopPropagation();
      return;
    }
    const filterButton = event.target.closest(".efilter");
    if (filterButton instanceof HTMLButtonElement) {
      const findingList = filterButton.closest(".finding-list");
      if (findingList) {
        findingList
          .querySelectorAll(".efilter")
          .forEach((button) => button.classList.remove("active"));
        filterButton.classList.add("active");
        const wanted = filterButton.dataset.filter;
        findingList.querySelectorAll("ol > li").forEach((item) => {
          const show =
            wanted === "all" ||
            (wanted === "defended"
              ? item.getAttribute("data-has-defenses") === "1"
              : item.getAttribute("data-type") === wanted);
          item.toggleAttribute("data-hidden", !show);
        });
      }
      return;
    }
    const sortButton = event.target.closest(".esort");
    if (sortButton instanceof HTMLButtonElement) {
      const findingList = sortButton.closest(".finding-list");
      const mode = sortButton.dataset.sort;
      if (findingList instanceof HTMLElement && mode) {
        sortFindingList(findingList, mode);
        const url = new URL(window.location.href);
        if (mode === "score") url.searchParams.delete("lsort");
        else url.searchParams.set("lsort", mode);
        window.history.replaceState({}, "", url);
      }
      return;
    }
    const revealButton = event.target.closest(".reveal-code");
    if (revealButton instanceof HTMLButtonElement) {
      const inlineCode = revealButton
        .closest(".xfile-peek")
        ?.querySelector(".inline-code");
      if (inlineCode instanceof HTMLElement) {
        const show = inlineCode.hasAttribute("hidden");
        inlineCode.toggleAttribute("hidden", !show);
        revealButton.textContent = show ? "⌃ hide" : "⌄ code";
      }
      event.preventDefault();
      return;
    }
    const back = event.target.closest(".panel-back");
    if (back) {
      event.preventDefault();
      selectFindings([]);
      return;
    }
    const line = event.target.closest(".goto-line, .path-step-no");
    if (line instanceof HTMLElement) {
      event.preventDefault();
      event.stopPropagation();
      jumpToLine(line.dataset.line);
      return;
    }
    const hit = event.target.closest(".hit");
    if (hit instanceof HTMLElement) {
      const ids = (hit.dataset.findings ?? "").split(",").filter(Boolean);
      if (ids.length) selectFindings(ids);
      return;
    }
    const row = event.target.closest(".finding-row, .xref");
    if (row instanceof HTMLElement && row.dataset.finding) {
      event.preventDefault();
      selectFindings([row.dataset.finding]);
      return;
    }
    const sinkRow = event.target.closest("tr.has-sink");
    if (sinkRow instanceof HTMLElement) {
      const ids = Array.from(sinkRow.querySelectorAll<HTMLElement>(".hit"))
        .flatMap((node) => (node.dataset.findings ?? "").split(","))
        .filter(Boolean);
      if (ids.length) selectFindings(ids);
    }
  };

  onCleanup(() => {
    const map = currentMap();
    if (map) clearPathOverlay(map);
  });

  return <div ref={rootRef} onClick={onCodeMapClick} innerHTML={html()} />;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Clipboard access can be denied outside a secure context; use the
      // browser's legacy copy path before reporting a failure.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected");
    }
  } finally {
    textarea.remove();
  }
}

function positionPeek(label: HTMLElement, popover: HTMLElement): void {
  const rect = label.getBoundingClientRect();
  const margin = 10;
  const desiredWidth = Math.min(
    640,
    Math.max(360, window.innerWidth - margin * 2),
  );
  popover.style.width = `${desiredWidth}px`;
  popover.style.maxWidth = `${desiredWidth}px`;
  popover.style.left = "0px";
  popover.style.top = "0px";
  const popoverRect = popover.getBoundingClientRect();
  const left = Math.min(
    Math.max(margin, rect.left),
    window.innerWidth - popoverRect.width - margin,
  );
  const below = rect.bottom + 8;
  const above = rect.top - popoverRect.height - 8;
  let top =
    below + popoverRect.height + margin <= window.innerHeight
      ? below
      : Math.max(margin, above);
  top = Math.min(
    Math.max(margin, top),
    Math.max(margin, window.innerHeight - popoverRect.height - margin),
  );
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function sortFindingList(findingList: HTMLElement, mode: string): void {
  const list = findingList.querySelector("ol");
  if (!list) return;
  const numberFrom = (item: Element, attribute: string) =>
    Number.parseFloat(item.getAttribute(attribute) ?? "") || 0;
  const items = Array.from(list.children);
  items.sort((left, right) => {
    if (mode === "line") {
      return (
        numberFrom(left, "data-sort-line") -
        numberFrom(right, "data-sort-line")
      );
    }
    if (mode === "sources") {
      return (
        numberFrom(right, "data-sort-sources") -
          numberFrom(left, "data-sort-sources") ||
        numberFrom(right, "data-sort-score") -
          numberFrom(left, "data-sort-score")
      );
    }
    if (mode === "type") {
      return (
        numberFrom(left, "data-sort-order") -
          numberFrom(right, "data-sort-order") ||
        numberFrom(left, "data-sort-line") -
          numberFrom(right, "data-sort-line")
      );
    }
    return (
      numberFrom(right, "data-sort-score") -
        numberFrom(left, "data-sort-score") ||
      numberFrom(left, "data-sort-line") -
        numberFrom(right, "data-sort-line")
    );
  });
  items.forEach((item) => list.appendChild(item));
  findingList.querySelectorAll(".esort").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-sort") === mode);
  });
}
