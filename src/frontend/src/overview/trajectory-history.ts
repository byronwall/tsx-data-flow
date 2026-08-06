export const BROWSER_URL_CHANGE_EVENT = "tsx-data-flow:url-change";

export function commitBrowserUrl(search: string, replace: boolean) {
  writeBrowserUrl(search, replace);
  notifyBrowserUrlChange();
}

export function replaceBrowserUrlSilently(search: string) {
  writeBrowserUrl(search, true);
}

function writeBrowserUrl(search: string, replace: boolean) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.search = search;
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

export function notifyBrowserUrlChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BROWSER_URL_CHANGE_EVENT));
}
