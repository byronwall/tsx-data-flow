export function clearPathOverlay(map: Element): void {
  map.querySelectorAll("tr.path-active").forEach((row) => {
    row.classList.remove("path-active", "sink-line");
    row.querySelector(".path-tag")?.remove();
    row.querySelector(".path-step-no")?.remove();
  });
}

export function applyPathOverlay(
  map: Element,
  finding: HTMLElement | null,
): void {
  clearPathOverlay(map);
  if (!finding) return;

  for (const line of splitValues(finding.dataset.pathLines)) {
    rowForLine(map, line)?.classList.add("path-active");
  }

  const sinkLine = finding.dataset.sinkLine;
  const sinkRow = sinkLine ? rowForLine(map, sinkLine) : null;
  if (sinkRow) {
    sinkRow.classList.add("path-active", "sink-line");
    const code = sinkRow.querySelector("td.code");
    if (code && !code.querySelector(".path-tag")) {
      const tag = document.createElement("span");
      tag.className = "path-tag";
      tag.textContent = "sink";
      code.appendChild(tag);
    }
  }

  for (const encodedStep of splitValues(finding.dataset.pathSteps)) {
    const [line, ordinal, defensiveMarker] = encodedStep.split(":");
    const gutter = rowForLine(map, line)?.querySelector("td.gutter");
    if (!gutter || gutter.querySelector(".path-step-no")) continue;
    const badge = document.createElement("span");
    const defensive = defensiveMarker === "d";
    badge.className = `path-step-no${defensive ? " def" : ""}`;
    badge.textContent = ordinal;
    badge.dataset.line = line;
    badge.title = `Path step ${ordinal}${defensive ? " · defensive" : ""}`;
    gutter.appendChild(badge);
  }
}

function rowForLine(map: Element, line: string): HTMLTableRowElement | null {
  return map.querySelector(`tr[data-line="${CSS.escape(line)}"]`);
}

function splitValues(value: string | undefined): string[] {
  return (value ?? "").split(",").filter(Boolean);
}
