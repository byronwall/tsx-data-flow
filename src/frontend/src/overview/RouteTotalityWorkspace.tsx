import { createMemo, createSignal } from "solid-js";
import type { RouteDataDetail } from "../../../api/contracts";
import { RouteTotalityGraph } from "./RouteTotalityGraph";
import { TrajectorySourceDialog } from "./TrajectorySourceDialog";
import { mergeSourceTargets, routeSourceEvidenceTargets } from "./route-source-targets";
import type { SourceEvidenceTarget } from "./source-evidence-model";
import type { TrajectoryUrlState } from "./trajectory-url-state";

export function RouteTotalityWorkspace(props: {
  detail: RouteDataDetail;
  generation: number;
  state: TrajectoryUrlState;
  onState: (patch: Partial<TrajectoryUrlState>, push?: boolean) => void;
  onCloseTransient: (active: boolean) => void;
}) {
  const [sourceTarget, setSourceTarget] = createSignal<SourceEvidenceTarget | null>(null);
  const [sourceContextTargets, setSourceContextTargets] = createSignal<SourceEvidenceTarget[]>([]);
  const selectedSourceEvidence = createMemo(() => {
    const source = props.detail.sources.find((item) => item.key === props.state.source);
    return source ? props.detail.evidence.find((item) => item.id === source.evidenceId) ?? null : null;
  });
  const selectedSourceFieldPaths = createMemo(() => props.detail.sources.find((item) => item.key === props.state.source)?.fields.map((field) => field.key) ?? []);
  const sourceTargets = createMemo(() => routeSourceEvidenceTargets(props.detail, null));
  const sourceDialogTargets = createMemo(() => mergeSourceTargets(sourceContextTargets(), sourceTargets()));
  const openSourceTarget = (target: SourceEvidenceTarget, contextTargets: readonly SourceEvidenceTarget[] = []) => {
    setSourceContextTargets([...contextTargets]);
    setSourceTarget(target);
    props.onCloseTransient(true);
  };
  const selectSourceTarget = (id: string) => {
    const target = sourceDialogTargets().find((item) => item.id === id);
    if (target) setSourceTarget(target);
  };
  const closeSource = () => {
    setSourceTarget(null);
    setSourceContextTargets([]);
    props.onCloseTransient(false);
  };
  const clearFieldFocus = () => props.onState({ fieldFocus: null, consumerFocus: null, totalitySelection: null, isolate: false });

  return <div class="route-totality-workspace">
    <main>
      <RouteTotalityGraph
        totality={props.detail.totality}
        shadowEvidence={props.detail.shadowEvidence}
        selectedSourceKey={props.state.source}
        selectedSourceEvidence={selectedSourceEvidence()}
        selectedSourceFieldPaths={selectedSourceFieldPaths()}
        fieldFocus={props.state.fieldFocus ?? null}
        consumerFocus={props.state.consumerFocus ?? null}
        generation={props.generation}
        hiddenComponentPolicy={props.detail.hiddenComponentPolicy}
        genericUiMode={props.state.genericUi}
        onGenericUiMode={(genericUi) => props.onState({ genericUi })}
        contextFocus={props.state.contextFocus ?? null}
        onContextFocusChange={(contextFocus) => props.onState({ contextFocus })}
        onFieldFocusChange={(fieldFocus, consumerFocus = null) => props.onState({ fieldFocus, consumerFocus })}
        onClearFieldFocus={clearFieldFocus}
        scopeKey={`${props.detail.route.key}:${props.detail.trajectory.key}`}
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
    </main>
    <TrajectorySourceDialog evidence={sourceTarget()} evidenceList={sourceDialogTargets()} generation={props.generation} onSelect={selectSourceTarget} onClose={closeSource} />
  </div>;
}
