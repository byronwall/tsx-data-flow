import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { DataTrajectoryCanvas } from "./DataTrajectoryCanvas";
import { RouteFlowGraph } from "./RouteFlowGraph";
import { RouteShadowEvidenceGraph } from "./RouteShadowEvidenceGraph";
import { RouteTotalityGraph } from "./RouteTotalityGraph";
import { TrajectoryInspector } from "./TrajectoryInspector";
import { TrajectorySourceDialog } from "./TrajectorySourceDialog";
import { sourceTargetFromEvidence, type SourceEvidenceTarget } from "./source-evidence-model";
import { mergeSourceTargets, routeSourceEvidenceTargets } from "./route-source-targets";
import { isolatedOperations } from "./trajectory-selection-model";
import { packetMarkdown, readPackets, writePackets, type TrajectoryPacket } from "./trajectory-packets";
import { trajectoryShapeSummary } from "./trajectory-shape-label";
import type { TrajectoryUrlState } from "./trajectory-url-state";

export function RouteTrajectoryWorkspace(props: { detail: RouteDataDetail; generation: number; state: TrajectoryUrlState; onState: (patch: Partial<TrajectoryUrlState>, push?: boolean) => void; onCloseTransient: (active: boolean) => void }) {
  const [preview, setPreview] = createSignal<RouteDataDetail["operations"][number] | null>(null);
  const [sourceTarget, setSourceTarget] = createSignal<SourceEvidenceTarget | null>(null);
  const [sourceContextTargets, setSourceContextTargets] = createSignal<SourceEvidenceTarget[]>([]);
  const [packets, setPackets] = createSignal<TrajectoryPacket[]>([]);
  const [packetOpen, setPacketOpen] = createSignal(false);
  const renderer = createMemo(() => props.state.trajectoryRenderer ?? "current");
  const expanded = createMemo(() => new Set(props.state.expand));
  const selected = createMemo(() => props.detail.operations.find((item) => item.key === props.state.item) ?? null);
  const isolated = createMemo(() => isolatedOperations(props.detail, props.state.item));
  const displayDetail = createMemo<RouteDataDetail>(() => props.state.isolate ? { ...props.detail, operations: isolated().operations } : props.detail);
  const activePacket = createMemo(() => packets().find((packet) => packet.id === props.state.packet) ?? packets()[0] ?? null);
  const sourceTargets = createMemo(() => routeSourceEvidenceTargets(props.detail, props.state.item));
  const sourceDialogTargets = createMemo(() => mergeSourceTargets(sourceContextTargets(), sourceTargets()));
  onMount(() => {
    const restored = readPackets(window.localStorage); setPackets(restored);
    if (!props.state.packet && restored[0]) props.onState({ packet: restored[0].id });
  });
  const persistPackets = (next: TrajectoryPacket[]) => { setPackets(next); writePackets(window.localStorage, next); };
  const ensurePacket = () => {
    const existing = activePacket(); if (existing) return existing;
    const packet = { id: `packet-${Date.now().toString(36)}`, name: `Route data packet`, entries: [] };
    persistPackets([...packets(), packet]); props.onState({ packet: packet.id }); return packet;
  };
  const addPacket = (note: string) => {
    const operation = selected(); if (!operation) return;
    const evidence = props.detail.evidence.find((item) => operation.sourceExpressionIds.includes(item.id));
    const packet = ensurePacket();
    const entry = { id: `${operation.key}-${Date.now().toString(36)}`, route: props.detail.route.pathPattern, flow: props.detail.trajectory.label, item: operation.key, label: operation.label, file: evidence?.file ?? null, line: evidence?.line ?? null, completeness: operation.completeness, note: note.trim(), addedAt: new Date().toISOString() };
    persistPackets(packets().map((item) => item.id === packet.id ? { ...item, entries: [...item.entries, entry] } : item)); setPacketOpen(true);
  };
  const removePacketEntry = (id: string) => { const packet = activePacket(); if (packet) persistPackets(packets().map((item) => item.id === packet.id ? { ...item, entries: item.entries.filter((entry) => entry.id !== id) } : item)); };
  const movePacketEntry = (id: string, direction: number) => { const packet = activePacket(); if (!packet) return; const entries = [...packet.entries]; const index = entries.findIndex((item) => item.id === id); const next = index + direction; if (index < 0 || next < 0 || next >= entries.length) return; [entries[index], entries[next]] = [entries[next], entries[index]]; persistPackets(packets().map((item) => item.id === packet.id ? { ...item, entries } : item)); };
  const openEvidence = (id: string) => {
    const target = sourceTargets().find((item) => item.id === id) ?? (() => {
      const evidence = props.detail.evidence.find((item) => item.id === id);
      return evidence ? { ...sourceTargetFromEvidence(evidence), scopeKey: `path:${evidence.file}` } : null;
    })();
    if (!target) return;
    setSourceContextTargets([]);
    setSourceTarget(target);
    props.onCloseTransient(true);
  };
  const openSourceTarget = (target: SourceEvidenceTarget, contextTargets: readonly SourceEvidenceTarget[] = []) => {
    setSourceContextTargets([...contextTargets]);
    setSourceTarget(target);
    props.onCloseTransient(true);
  };
  const selectSourceTarget = (id: string) => {
    const target = sourceDialogTargets().find((item) => item.id === id);
    if (target) setSourceTarget(target);
  };
  const closeEvidence = () => {
    setSourceTarget(null);
    setSourceContextTargets([]);
    props.onCloseTransient(false);
  };
  const toggleExpand = (key: string) => { const next = new Set(props.state.expand); if (next.has(key)) next.delete(key); else next.add(key); props.onState({ expand: [...next] }); };
  const sourceEvidence = createMemo(() => sourceTarget());
  const previewShape = createMemo(() => props.detail.shapes.find((shape) => shape.id === preview()?.outputShapeIds[0]) ?? null);
  const openTrajectory = () => props.onState({ view: "trajectory", item: props.detail.operations[0]?.key ?? null });
  const currentRenderer = () => renderer() === "current";
  const totalityRenderer = () => renderer() === "totality";
  const changeRenderer = (next: "current" | "experimental" | "totality") => {
    if (renderer() === next) return;
    props.onState({ trajectoryRenderer: next, totalitySelection: null, graphCamera: null, isolate: false });
  };
  const activateRenderer = (event: KeyboardEvent, next: "current" | "experimental" | "totality") => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    changeRenderer(next);
  };
  return <div class="route-trajectory-workspace" classList={{ "route-flow-open": !currentRenderer() || props.state.view === "context", "route-totality-open": totalityRenderer() }}>
    <main>
      <div class="route-trajectory-renderer-toggle" role="group" aria-label="Route trajectory renderer"><span>Renderer</span><button type="button" aria-pressed={currentRenderer()} onClick={() => changeRenderer("current")} onKeyDown={(event) => activateRenderer(event, "current")}>Current workspace</button><button type="button" aria-pressed={renderer() === "experimental"} onClick={() => changeRenderer("experimental")} onKeyDown={(event) => activateRenderer(event, "experimental")}>Experimental proof graph</button><button type="button" aria-pressed={totalityRenderer()} onClick={() => changeRenderer("totality")} onKeyDown={(event) => activateRenderer(event, "totality")}>Route totality</button></div>
      <div class="route-trajectory-main-content">
        <Show when={totalityRenderer()} fallback={<Show when={!currentRenderer()} fallback={<Show when={props.state.view === "context"} fallback={<>
          <Show when={props.state.isolate && isolated().incomingStub}><div class="trajectory-boundary-stub incoming">← {isolated().incomingStub?.label}</div></Show>
          <DataTrajectoryCanvas detail={displayDetail()} selectedKey={props.state.item} expanded={expanded()} isolated={props.state.isolate} zoom={props.state.zoom ?? 1} onSelect={(item) => props.onState({ item })} onPreview={setPreview} onToggleExpand={toggleExpand} onOpenEvidence={openEvidence} onZoom={(zoom) => props.onState({ zoom })} />
          <Show when={props.state.isolate && isolated().outgoingStub}><div class="trajectory-boundary-stub outgoing">{isolated().outgoingStub?.label} →</div></Show>
        </>}><RouteFlowGraph detail={props.detail} sourceKey={props.state.source} genericUiMode={props.state.genericUi} revealResetKey={`${props.state.open}:${props.generation}:${props.detail.route.key}:${props.detail.trajectory.key}`} onSource={(source) => props.onState({ source, item: null, expand: [], isolate: false, pan: null, zoom: null }, true)} onGenericUiMode={(genericUi) => props.onState({ genericUi })} onOpenEvidence={openTrajectory} onOpenSource={openEvidence} /></Show>}>
          <RouteShadowEvidenceGraph evidence={props.detail.shadowEvidence ?? null} />
        </Show>}>
          <RouteTotalityGraph
            totality={props.detail.totality}
            generation={props.generation}
            hiddenComponentPolicy={props.detail.hiddenComponentPolicy}
            genericUiMode={props.state.genericUi}
            onGenericUiMode={(genericUi) => props.onState({ genericUi })}
            scopeKey={`${props.detail.route.key}:${props.detail.trajectory.key}:${props.state.trajectoryRenderer ?? "current"}`}
            selection={props.state.totalitySelection ?? null}
            camera={props.state.graphCamera ?? null}
            isolated={Boolean(props.state.isolate && props.state.totalitySelection?.kind === "node")}
            onInvestigationStateChange={({ selection, isolated, camera }) => props.onState({
              totalitySelection: selection,
              isolate: isolated,
              ...(camera === undefined ? {} : { graphCamera: camera }),
            })}
            onOpenSource={openSourceTarget}
          />
        </Show>
        <Show when={currentRenderer() && preview()}>{(item) => <div class="trajectory-preview" role="status"><strong>{item().label}</strong><span>{item().effect} · evidence {item().completeness}</span><span><b>Output</b> <code>{trajectoryShapeSummary(previewShape())}</code></span><p>{item().completenessReason}</p></div>}</Show>
      </div>
    </main>
    <Show when={currentRenderer() && props.state.view === "trajectory"}><TrajectoryInspector detail={props.detail} selectedKey={props.state.item} contextNode={null} contextMode={false} onOpenTrajectory={openTrajectory} onSelect={(item) => props.onState({ item })} onOpenEvidence={openEvidence} isolated={props.state.isolate} onIsolate={() => props.onState({ isolate: !props.state.isolate })} onAddPacket={addPacket} /></Show>
    <Show when={currentRenderer() && props.state.view === "trajectory"}><aside class="trajectory-packet" classList={{ open: packetOpen() }}><button type="button" class="trajectory-packet-toggle" aria-expanded={packetOpen()} onClick={() => setPacketOpen((value) => !value)}>Packet <b>{activePacket()?.entries.length ?? 0}</b></button><Show when={packetOpen()}><div class="trajectory-packet-body"><h3>{activePacket()?.name ?? "Route data packet"}</h3><For each={activePacket()?.entries ?? []}>{(entry, index) => <article><strong>{entry.label}</strong><span class="mono">{entry.file}:{entry.line}</span><Show when={entry.note}><p>{entry.note}</p></Show><div><button type="button" disabled={index() === 0} onClick={() => movePacketEntry(entry.id, -1)}>↑</button><button type="button" disabled={index() === (activePacket()?.entries.length ?? 0) - 1} onClick={() => movePacketEntry(entry.id, 1)}>↓</button><button type="button" onClick={() => removePacketEntry(entry.id)}>Remove</button></div></article>}</For><Show when={activePacket()}>{(packet) => <button type="button" onClick={() => void navigator.clipboard.writeText(packetMarkdown(packet()))}>Copy Markdown</button>}</Show></div></Show></aside></Show>
    <TrajectorySourceDialog evidence={sourceEvidence()} evidenceList={sourceDialogTargets()} generation={props.generation} onSelect={selectSourceTarget} onClose={closeEvidence} />
  </div>;
}
