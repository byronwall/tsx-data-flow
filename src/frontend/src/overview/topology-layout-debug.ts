import { createSignal, onCleanup, onMount } from "solid-js";
import type { ComponentTopologyLayoutSettings, ComponentTopologyLayoutStep } from "./component-topology-layout";

type NumericSetting = Exclude<keyof ComponentTopologyLayoutSettings, "separationPasses">;

export type TopologyLayoutDebugController = {
  visible: () => boolean;
  forcesVisible: () => boolean;
  copied: () => boolean;
  settings: () => ComponentTopologyLayoutSettings;
  steps: () => ComponentTopologyLayoutStep[];
  updateSetting: (key: NumericSetting, value: number) => void;
  runTicks: (count: number) => void;
  runSeparationPass: () => void;
  clearSteps: () => void;
  toggleForces: () => void;
  reset: () => void;
  copy: (payload: unknown) => Promise<void>;
};

export function createTopologyLayoutDebug(options: {
  defaults: ComponentTopologyLayoutSettings;
  onClose?: () => void;
  onReset?: () => void;
  maximumSimulationTicks?: number;
}): TopologyLayoutDebugController {
  const [visible, setVisible] = createSignal(false);
  const [forcesVisible, setForcesVisible] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const [settings, setSettings] = createSignal<ComponentTopologyLayoutSettings>({ ...options.defaults });
  const [steps, setSteps] = createSignal<ComponentTopologyLayoutStep[]>([]);
  let copiedResetTimer: number | undefined;

  const closeEnhancements = () => {
    setForcesVisible(false);
    options.onClose?.();
  };
  const toggleVisible = () => {
    setVisible((current) => {
      if (current) closeEnhancements();
      return !current;
    });
  };
  const updateSetting = (key: NumericSetting, value: number) => {
    if (key === "simulationTicks") {
      setSteps([]);
      setSettings((current) => ({ ...current, simulationTicks: value, separationPasses: 0 }));
      return;
    }
    setSettings((current) => ({ ...current, [key]: value }));
  };
  const runTicks = (count: number) => {
    const limit = options.maximumSimulationTicks ?? 1000;
    const allowed = Math.max(0, Math.min(count, limit - settings().simulationTicks));
    if (!allowed) return;
    setSteps((current) => [...current, ...Array<ComponentTopologyLayoutStep>(allowed).fill("tick")]);
    setSettings((current) => ({ ...current, simulationTicks: current.simulationTicks + allowed }));
  };
  const runSeparationPass = () => {
    setSteps((current) => [...current, "separate"]);
    setSettings((current) => ({ ...current, separationPasses: current.separationPasses + 1 }));
  };
  const reset = () => {
    setSteps([]);
    setSettings({ ...options.defaults });
    closeEnhancements();
    options.onReset?.();
  };
  const copy = async (payload: unknown) => {
    await copyText(JSON.stringify(payload, null, 2));
    setCopied(true);
    if (copiedResetTimer !== undefined) window.clearTimeout(copiedResetTimer);
    copiedResetTimer = window.setTimeout(() => setCopied(false), 1300);
  };

  onMount(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!isUnmodifiedShortcut(event) || event.key.toLowerCase() !== "d") return;
      event.preventDefault();
      toggleVisible();
    };
    document.addEventListener("keydown", handleShortcut);
    onCleanup(() => document.removeEventListener("keydown", handleShortcut));
  });
  onCleanup(() => {
    if (copiedResetTimer !== undefined) window.clearTimeout(copiedResetTimer);
  });

  return {
    visible,
    forcesVisible,
    copied,
    settings,
    steps,
    updateSetting,
    runTicks,
    runSeparationPass,
    clearSteps: () => setSteps([]),
    toggleForces: () => setForcesVisible((current) => !current),
    reset,
    copy,
  };
}

function isUnmodifiedShortcut(event: KeyboardEvent): boolean {
  const target = event.target;
  return !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !event.repeat
    && !(target instanceof HTMLInputElement)
    && !(target instanceof HTMLTextAreaElement)
    && !(target instanceof HTMLSelectElement)
    && !(target instanceof HTMLElement && target.isContentEditable);
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Use the local fallback.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy command was rejected");
  } finally {
    textarea.remove();
  }
}
