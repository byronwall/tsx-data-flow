import { escapeHtml } from "./escape.mjs";

// GRAPH-COLOR-1: assign every file in a fan-out graph a *distinct* color. The old
// per-file string hash collided files onto near-identical hues ("I can't tell if
// those are different"). Here hues walk the golden angle (≈137.5°) so consecutive
// files land far apart on the wheel, and a slow lightness cycle keeps them apart
// once the wheel wraps. Deterministic per render (insertion order of files).
function fanoutFileColors(files) {
  const map = new Map();
  files.forEach((file, i) => {
    const hue = Math.round((i * 137.508) % 360);
    const sat = 62;
    const light = 46 + (Math.floor((i * 137.508) / 360) % 3) * 7;
    map.set(file, { hue, sat, light });
  });
  return map;
}

// Stable anchor for a fan-out source, so the per-file panel (HOME-2) can link to
// the same source's graph in the overview's "Detected fan-outs" section (HOME-1).
export function fanOutAnchor(root) {
  return (
    "fanout-" +
    String(root ?? "source")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  );
}

const truncMid = (text, max = 26) => {
  const s = String(text);
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
};

// GRAPH-1 + GRAPH-GROUP-1 (+ round 7): a node/edge diagram for one fan-out source.
// The source sits on the LEFT (column 1) and links to its DEFINITION when we could
// resolve it (FANOUT-DEF-1); the reached sinks are GROUPED into a labeled band per
// file (filename shown once, sinks as `:line where · depth` leaves — FANOUT-DEPTH-1
// shows how derived each one is), every file gets a distinct color (GRAPH-COLOR-1),
// and the bands flow across TWO columns (columns 2 & 3 — FANOUT-GRID-1) so a wide
// fan is half as tall and fills the empty right margin. Exactly ONE edge runs from
// the source to each file band, not one per sink (FANOUT-EDGE-1): the band carries
// membership, the per-sink fan was just noise. No caps. `relPath` may be null
// (overview = purely cross-file); in-file sinks select on the code map, cross-file
// sinks open the target file.
export function fanOutGraphSvg(row, relPath) {
  const sinks = row.graphSinks ?? row.sinks ?? [];
  if (!sinks.length) return "";

  const byFile = new Map();
  for (const s of sinks) {
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file).push(s);
  }
  const fileList = [...byFile.keys()];
  const colors = fanoutFileColors(fileList);

  const rowH = 20; // height of one sink leaf
  const headH = 22; // height of a file band header
  const bandGap = 12;
  const top = 14;
  const srcW = 150;
  const bandW = 236;
  const colGap = 20;
  const colAX = srcW + 60;
  const colBX = colAX + bandW + colGap;
  const W = colBX + bandW;

  // FANOUT-GRID-1: distribute the file bands across two columns, always adding the
  // next band to the currently-shorter column, so the columns stay balanced and the
  // graph is ~half the height of the old single stack.
  const bandHeightOf = (file) => headH + byFile.get(file).length * rowH;
  const cols = [
    { x: colAX, y: top, items: [] },
    { x: colBX, y: top, items: [] },
  ];
  for (const file of fileList) {
    const col = cols[0].y <= cols[1].y ? cols[0] : cols[1];
    const h = bandHeightOf(file);
    col.items.push({ file, top: col.y, h });
    col.y += h + bandGap;
  }
  const totalH = Math.max(96, Math.max(cols[0].y, cols[1].y) + 2);
  const srcCy = totalH / 2;

  const edges = [];
  const bands = [];
  for (const col of cols) {
    for (const { file, top: bandTop, h } of col.items) {
      const list = byFile.get(file);
      const { hue, sat, light } = colors.get(file);
      const hsl = `${hue} ${sat}% ${light}%`;
      const bandX = col.x;
      const leafX = bandX + 14;
      bands.push(
        `<rect x="${bandX}" y="${bandTop}" width="${bandW}" height="${h}" rx="8" fill="hsl(${hsl} / 0.06)" stroke="hsl(${hsl})" stroke-width="1"/>
      <rect x="${bandX + 11}" y="${bandTop + 7}" width="9" height="9" rx="2" fill="hsl(${hsl})"/>
      <text x="${bandX + 25}" y="${bandTop + 15}" font-size="11" font-weight="600" fill="currentColor">${escapeHtml(
        truncMid(file.split("/").pop(), 28),
      )}</text>`,
      );
      list.forEach((s, j) => {
        const cy = bandTop + headH + j * rowH + rowH / 2;
        const inFile = relPath != null && s.file === relPath;
        const where = escapeHtml(
          truncMid(`:${s.line} ${s.label ?? ""}`.trim(), 30),
        );
        const depth = `<tspan fill="hsl(${hsl})" font-weight="600"> · d${s.depth ?? 0}</tspan>`;
        const open = inFile
          ? `<a class="xref" data-finding="${escapeHtml(s.id ?? "")}">`
          : `<a class="xfile" href="/file?path=${encodeURIComponent(s.file)}#L${s.line}">`;
        bands.push(
          `${open}<g class="fg-node"><rect class="fg-hit" x="${bandX + 4}" y="${
            cy - rowH / 2 + 1
          }" width="${bandW - 8}" height="${rowH - 2}" rx="4"/><text x="${leafX}" y="${
            cy + 4
          }" font-size="11" fill="currentColor"${
            inFile ? ' font-weight="600"' : ""
          }>${where}${depth}</text></g></a>`,
        );
      });
      // FANOUT-EDGE-1: one edge from the source to this file band's center.
      const bandCy = bandTop + h / 2;
      edges.push(
        `<path d="M${srcW} ${srcCy} C ${srcW + 70} ${srcCy}, ${bandX - 50} ${bandCy}, ${bandX} ${bandCy}" fill="none" stroke="hsl(${hsl} / 0.55)" stroke-width="1.6"/>`,
      );
    }
  }

  const legend = fileList
    .map((f) => {
      const { hue, sat, light } = colors.get(f);
      return `<span class="fg-key"><span class="fg-swatch" style="background:hsl(${hue} ${sat}% ${light}%)"></span>${escapeHtml(
        f.split("/").pop(),
      )}</span>`;
    })
    .join("");

  // FANOUT-DEF-1: link the source node to where it's DEFINED when the analyzer
  // resolved it; for a single-file fan-out fall back to the one file it lives in. A
  // cross-file source we couldn't resolve stays an unlinked node (honest — we don't
  // know where it's declared rather than guessing a usage).
  const defTarget =
    row.def != null
      ? `/file?path=${encodeURIComponent(row.def.file)}#L${row.def.line}`
      : row.fileCount === 1 && fileList[0]
        ? `/file?path=${encodeURIComponent(fileList[0])}`
        : null;
  const srcLabel = escapeHtml(truncMid(row.root ?? "source", 20));
  const srcNode = `<g class="fg-src"><rect x="0" y="${srcCy - 16}" width="${srcW}" height="32" rx="8" fill="hsl(205 70% 50% / 0.16)" stroke="hsl(205 70% 50%)" stroke-width="2"/>
    <text x="10" y="${srcCy + 4}" font-size="11.5" fill="currentColor">${srcLabel}</text></g>`;
  const source = defTarget
    ? `<a class="xfile" href="${defTarget}" aria-label="Jump to definition of ${srcLabel}">${srcNode}</a>`
    : srcNode;

  return `<div class="fanout-graph">
  <svg viewBox="0 0 ${W} ${totalH}" width="100%" height="${totalH}" role="img" aria-label="Fan-out graph for ${escapeHtml(row.root ?? "source")}">
    ${edges.join("")}
    ${source}
    ${bands.join("")}
  </svg>
  <div class="fg-legend">${legend}</div>
</div>`;
}

// VIZ-1: a stable anchor for a boundary helper, so the boundary viewer can key the
// selected helper in the URL (refresh-safe), the same way fan-out does.
export function boundaryAnchor(helper) {
  return (
    "boundary-" +
    `${helper.name}-${helper.file}-${helper.line}`
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
  );
}

// VIZ-1: the reusable TWO-SIDED network diagram. For one boundary helper it draws the
// inbound source lineages on the LEFT, the helper itself (the boundary) in the MIDDLE
// — linking to its definition — and the call sites it re-spreads to on the RIGHT, with
// one edge per node. This is the template the fan-in / junctions / prop-relay views
// will adopt (each is the same sources → boundary → consumers shape). Mirrors
// `fanOutGraphSvg`'s node styling so the two pictures read consistently.
export function boundaryGraphSvg(helper) {
  const sources = helper.inRoots ?? [];
  const callers = helper.callers ?? [];
  const nh = 24;
  const gap = 10;
  const colW = 196;
  const midW = 188;
  const midGap = 56;
  const midX = colW + midGap;
  const rightX = midX + midW + midGap;
  const W = rightX + colW;
  const rows = Math.max(sources.length, callers.length, 1);
  const H = Math.max(120, 28 + rows * (nh + gap));
  const midCy = H / 2;
  // Center each column's block of nodes vertically against the middle node.
  const cyOf = (i, count) => {
    const blockH = Math.max(0, count * (nh + gap) - gap);
    return (H - blockH) / 2 + i * (nh + gap) + nh / 2;
  };

  const sourceHsl = "262 60% 52%";
  const callerHsl = "150 55% 40%";
  const edges = [];
  const nodes = [];

  sources.forEach((label, i) => {
    const cy = cyOf(i, sources.length);
    nodes.push(
      `<g class="fg-node"><rect class="fg-hit" x="0" y="${cy - nh / 2}" width="${colW}" height="${nh}" rx="6" fill="hsl(${sourceHsl} / 0.08)" stroke="hsl(${sourceHsl} / 0.5)"/><text x="12" y="${
        cy + 4
      }" font-size="11" fill="currentColor">${escapeHtml(truncMid(label, 28))}</text></g>`,
    );
    edges.push(
      `<path d="M${colW} ${cy} C ${colW + 30} ${cy}, ${midX - 30} ${midCy}, ${midX} ${midCy}" fill="none" stroke="hsl(${sourceHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  if (sources.length === 0) {
    nodes.push(
      `<text x="0" y="${midCy + 4}" font-size="11" fill="hsl(${sourceHsl})">(no traced inputs)</text>`,
    );
  }

  callers.forEach((caller, i) => {
    const cy = cyOf(i, callers.length);
    const where = escapeHtml(
      truncMid(`${caller.file.split("/").pop()}:${caller.line}`, 28),
    );
    nodes.push(
      `<a class="xfile" href="/file?path=${encodeURIComponent(caller.file)}#L${caller.line}"><g class="fg-node"><rect class="fg-hit" x="${rightX}" y="${
        cy - nh / 2
      }" width="${colW}" height="${nh}" rx="6" fill="hsl(${callerHsl} / 0.08)" stroke="hsl(${callerHsl} / 0.5)"/><text x="${
        rightX + 12
      }" y="${cy + 4}" font-size="11" fill="currentColor">${where}</text></g></a>`,
    );
    edges.push(
      `<path d="M${midX + midW} ${midCy} C ${midX + midW + 30} ${midCy}, ${rightX - 30} ${cy}, ${rightX} ${cy}" fill="none" stroke="hsl(${callerHsl} / 0.5)" stroke-width="1.4"/>`,
    );
  });
  if (callers.length === 0) {
    nodes.push(
      `<text x="${rightX}" y="${midCy + 4}" font-size="11" fill="hsl(${callerHsl})">(no resolved callers)</text>`,
    );
  }

  const midLabel = escapeHtml(truncMid(`${helper.name}()`, 22));
  const midNode = `<g class="fg-src"><rect x="${midX}" y="${midCy - 18}" width="${midW}" height="36" rx="8" fill="hsl(205 70% 50% / 0.16)" stroke="hsl(205 70% 50%)" stroke-width="2"/>
    <text x="${midX + 12}" y="${midCy - 2}" font-size="11.5" font-weight="600" fill="currentColor">${midLabel}</text>
    <text x="${midX + 12}" y="${midCy + 13}" font-size="10" fill="var(--muted)">${escapeHtml(helper.verdict ?? "")}</text></g>`;
  const mid = `<a class="xfile" href="/file?path=${encodeURIComponent(helper.file)}#L${helper.line}" aria-label="Jump to ${midLabel}">${midNode}</a>`;

  return `<div class="fanout-graph">
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Boundary diagram for ${escapeHtml(helper.name)}">
    ${edges.join("")}
    ${nodes.join("")}
    ${mid}
  </svg>
  <div class="fg-legend"><span class="fg-key"><span class="fg-swatch" style="background:hsl(${sourceHsl})"></span>inbound sources (${sources.length})</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(205 70% 50%)"></span>boundary</span><span class="fg-key"><span class="fg-swatch" style="background:hsl(${callerHsl})"></span>call sites (${callers.length})</span></div>
</div>`;
}
