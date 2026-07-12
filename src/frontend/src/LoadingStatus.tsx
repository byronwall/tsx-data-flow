import { For, createSignal, onCleanup, onMount } from "solid-js";

const UPDATE_INTERVAL_MS = 1_000;
const STEPS = [
  { id: "program", label: "Build TypeScript program" },
  { id: "identity", label: "Index symbols" },
  { id: "trace", label: "Trace render paths" },
  { id: "summarize", label: "Rank and summarize findings" },
  { id: "project", label: "Prepare page data" },
] as const;
type StepId = typeof STEPS[number]["id"];
type ProgressUpdate = { operation?: string; phase?: string; step?: StepId; message?: string; completed?: number; total?: number; file?: string };

export function LoadingStatus(props: { subject: string; operation: "workspace" | "file" | "report" | "refresh" }) {
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [serverMessage, setServerMessage] = createSignal("");
  const [updates, setUpdates] = createSignal<Partial<Record<StepId, ProgressUpdate>>>({});
  const [activeStep, setActiveStep] = createSignal<StepId | null>(null);

  onMount(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
    }, UPDATE_INTERVAL_MS);
    const events = new EventSource("/api/progress");
    events.addEventListener("progress", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as ProgressUpdate;
        if (update.operation !== props.operation) return;
        if (update.phase !== "complete" && update.message) setServerMessage(update.message);
        if (update.step) {
          setActiveStep(update.step);
          setUpdates((current) => ({ ...current, [update.step!]: update }));
        }
      } catch { /* Ignore malformed side-channel events; the primary request still owns errors. */ }
    });
    onCleanup(() => { window.clearInterval(timer); events.close(); });
  });

  const detail = () => {
    const elapsed = elapsedSeconds();
    if (serverMessage()) return `${serverMessage()}… ${elapsed}s`;
    if (elapsed < 5) return "Starting analysis…";
    if (elapsed < 15) return `Analyzing the project… ${elapsed}s`;
    if (elapsed < 30) return `Still analyzing; large projects can take a while… ${elapsed}s`;
    return `Analysis is still running… ${elapsed}s`;
  };
  const activeIndex = () => STEPS.findIndex((step) => step.id === activeStep());
  const stateFor = (id: StepId, index: number) => id === activeStep() ? "active" : activeIndex() > index ? "complete" : "future";
  const measureFor = (id: StepId) => {
    const update = updates()[id];
    return update?.total !== undefined && update.completed !== undefined ? `${update.completed}/${update.total}` : "";
  };
  const percentFor = (id: StepId) => {
    const update = updates()[id];
    return update?.total ? Math.min(100, Math.round(((update.completed ?? 0) / update.total) * 100)) : 0;
  };

  return (
    <div class="loading-status" role="status" aria-live="polite">
      <div class="loading-status-heading">
        <span class="loading-status-spinner" aria-hidden="true" />
        <span>
        <strong>Loading {props.subject}</strong>
        <small>{detail()}</small>
        </span>
      </div>
      <ol class="loading-steps">
        <For each={STEPS}>{(step, index) => <li class={`loading-step ${stateFor(step.id, index())}`}>
          <span class="loading-step-marker" aria-hidden="true">{stateFor(step.id, index()) === "complete" ? "✓" : index() + 1}</span>
          <span class="loading-step-body">
            <span class="loading-step-label">{step.label}</span>
            <span class="loading-step-measure">{measureFor(step.id)}</span>
            <span class="loading-step-bar" aria-hidden="true"><span style={{ width: `${percentFor(step.id)}%` }} /></span>
          </span>
        </li>}</For>
      </ol>
    </div>
  );
}
