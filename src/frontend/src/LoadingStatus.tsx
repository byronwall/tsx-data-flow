import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";

const UPDATE_INTERVAL_MS = 1_000;
const STEPS = [
  { id: "program", label: "Build TypeScript program" },
  { id: "identity", label: "Index symbols" },
  { id: "trace", label: "Trace render paths" },
  { id: "summarize", label: "Rank and summarize findings" },
  { id: "project", label: "Prepare page data" },
] as const;
type StepId = typeof STEPS[number]["id"];
type LoadingOperation = "workspace" | "file" | "report" | "refresh";
type ProgressPhase = "queued" | "analyzing" | "projecting" | "complete" | "error";
type ProgressUpdate = { requestId?: number; operation?: string; phase?: string; step?: StepId; message?: string; completed?: number; total?: number; file?: string };
type LoadingPhase = "pending" | "complete" | "error" | "disconnected";

const MAX_MESSAGE_LENGTH = 180;

function boundedMessage(message: string | undefined, fallback: string) {
  const normalized = message?.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length > MAX_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : normalized;
}

function isProgressPhase(phase: string | undefined): phase is ProgressPhase {
  return phase === "queued" || phase === "analyzing" || phase === "projecting" || phase === "complete" || phase === "error";
}

function isStepId(step: string | undefined): step is StepId {
  return STEPS.some((candidate) => candidate.id === step);
}

export function LoadingStatus(props: { subject: string; operation: LoadingOperation; isPending?: () => boolean }) {
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [serverMessage, setServerMessage] = createSignal("");
  const [updates, setUpdates] = createSignal<Partial<Record<StepId, ProgressUpdate>>>({});
  const [activeStep, setActiveStep] = createSignal<StepId | null>(null);
  const [phase, setPhase] = createSignal<LoadingPhase>("pending");

  onMount(() => {
    const isPending = props.isPending ?? (() => true);
    let startedAt = Date.now();
    let timer: number | undefined;
    let disposed = false;
    let ownedRequestId: number | null = null;
    let terminalRequestId: number | null = null;

    const startTimer = () => {
      if (timer !== undefined) return;
      timer = window.setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000));
      }, UPDATE_INTERVAL_MS);
    };
    const stopTimer = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const resetProgress = () => {
      startedAt = Date.now();
      setElapsedSeconds(0);
      setServerMessage("");
      setUpdates({});
      setActiveStep(null);
      setPhase("pending");
      startTimer();
    };

    startTimer();
    const events = new EventSource("/api/progress");
    const acceptRequest = (update: ProgressUpdate) => {
      if (!Number.isSafeInteger(update.requestId)) return false;
      const requestId = update.requestId!;
      if (ownedRequestId === null) {
        if (terminalRequestId !== null && requestId <= terminalRequestId) return false;
        if (update.phase === "complete" || update.phase === "error") {
          terminalRequestId = requestId;
          return true;
        }
        ownedRequestId = requestId;
        terminalRequestId = null;
        resetProgress();
        return true;
      }
      return requestId === ownedRequestId;
    };
    const clearActiveProgress = () => {
      setActiveStep(null);
      setUpdates({});
      stopTimer();
    };
    events.addEventListener("progress", (event) => {
      if (disposed || !isPending()) return;
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as ProgressUpdate;
        if (update.operation !== props.operation || !isProgressPhase(update.phase) || !acceptRequest(update)) return;
        if (update.phase === "complete") {
          setServerMessage(boundedMessage(update.message, "Analysis complete"));
          setPhase("complete");
          clearActiveProgress();
          return;
        }
        if (update.phase === "error") {
          setServerMessage(boundedMessage(update.message, "The analysis request failed."));
          setPhase("error");
          clearActiveProgress();
          return;
        }
        setPhase("pending");
        startTimer();
        if (update.message) setServerMessage(boundedMessage(update.message, "Analysis in progress"));
        if (isStepId(update.step)) {
          setActiveStep(update.step);
          setUpdates((current) => ({ ...current, [update.step!]: update }));
        }
      } catch { /* Ignore malformed side-channel events; the primary request still owns errors. */ }
    });
    events.onerror = () => {
      if (disposed || !isPending() || phase() !== "pending") return;
      setServerMessage("Live progress disconnected; waiting for the main request.");
      setPhase("disconnected");
      clearActiveProgress();
    };
    createEffect(() => {
      if (isPending() || disposed) return;
      setPhase("complete");
      stopTimer();
      events.close();
    });
    onCleanup(() => {
      disposed = true;
      stopTimer();
      events.close();
    });
  });

  const detail = () => {
    if (phase() === "complete") return serverMessage() || "Analysis complete";
    if (phase() === "error") return `Analysis failed: ${serverMessage() || "The request did not complete."}`;
    if (phase() === "disconnected") return serverMessage() || "Live progress disconnected; waiting for the main request.";
    const elapsed = elapsedSeconds();
    if (serverMessage()) return `${serverMessage()}… ${elapsed}s`;
    if (elapsed < 5) return "Starting analysis…";
    if (elapsed < 15) return `Analyzing the project… ${elapsed}s`;
    if (elapsed < 30) return `Still analyzing; large projects can take a while… ${elapsed}s`;
    return `Analysis is still running… ${elapsed}s`;
  };
  const activeIndex = () => STEPS.findIndex((step) => step.id === activeStep());
  const stateFor = (id: StepId, index: number) => phase() === "complete" ? "complete" : id === activeStep() ? "active" : activeIndex() > index ? "complete" : "future";
  const measureFor = (id: StepId) => {
    const update = updates()[id];
    return update?.total !== undefined && update.completed !== undefined ? `${update.completed}/${update.total}` : "";
  };
  const percentFor = (id: StepId) => {
    const update = updates()[id];
    return update?.total ? Math.min(100, Math.round(((update.completed ?? 0) / update.total) * 100)) : 0;
  };

  return (
    <div class="loading-status" role="status" aria-live="polite" aria-busy={phase() === "pending"}>
      <div class="loading-status-heading">
        <span class="loading-status-spinner" aria-hidden="true" style={{ "animation-play-state": phase() === "pending" ? "running" : "paused" }} />
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
