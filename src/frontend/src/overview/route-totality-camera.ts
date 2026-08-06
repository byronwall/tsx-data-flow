import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";
import type { TrajectoryGraphCamera } from "./trajectory-url-state";

export const DEFAULT_ROUTE_TOTALITY_CAMERA: TrajectoryGraphCamera = { x: 0, y: 0, scale: 1 };

export type RouteTotalityCameraPoint = { x: number; y: number };

export type RouteTotalityCameraOptions = {
  initialCamera: TrajectoryGraphCamera | null;
  getViewportSize: () => { width: number; height: number };
  getSvg: () => SVGSVGElement | undefined;
  onCommit: (camera: TrajectoryGraphCamera | null) => void;
  onTap: () => void;
  minScale?: number;
  maxScale?: number;
  commitDelayMs?: number;
};

export type RouteTotalityCameraController = {
  camera: Accessor<TrajectoryGraphCamera>;
  dragging: Accessor<boolean>;
  setCamera: (camera: TrajectoryGraphCamera) => void;
  isCommitPending: () => boolean;
  cancelPendingCommit: () => void;
  cancelPan: () => void;
  syncControlledCamera: (camera: TrajectoryGraphCamera | null | undefined) => void;
  reset: () => void;
  zoomAt: (nextScale: number, anchor?: RouteTotalityCameraPoint, commit?: boolean) => void;
  startPan: (event: PointerEvent) => void;
  movePan: (event: PointerEvent) => void;
  finishPan: (event: PointerEvent) => void;
  zoomFromWheel: (event: WheelEvent) => void;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  camera: TrajectoryGraphCamera;
  moved: boolean;
};

const DEFAULT_MIN_SCALE = 0.55;
const DEFAULT_MAX_SCALE = 10;
const DEFAULT_COMMIT_DELAY = 180;

export function createRouteTotalityCamera(options: RouteTotalityCameraOptions): RouteTotalityCameraController {
  const minScale = options.minScale ?? DEFAULT_MIN_SCALE;
  const maxScale = options.maxScale ?? DEFAULT_MAX_SCALE;
  const commitDelayMs = options.commitDelayMs ?? DEFAULT_COMMIT_DELAY;
  const [camera, setCamera] = createSignal<TrajectoryGraphCamera>({
    ...(options.initialCamera ?? DEFAULT_ROUTE_TOTALITY_CAMERA),
  });
  const [pan, setPan] = createSignal<PanState | null>(null);
  const dragging = createMemo(() => Boolean(pan()?.moved));
  let cameraCommitTimer: ReturnType<typeof setTimeout> | undefined;
  let cameraCommitPending = false;

  const cancelPendingCommit = () => {
    if (cameraCommitTimer !== undefined) {
      clearTimeout(cameraCommitTimer);
      cameraCommitTimer = undefined;
    }
    cameraCommitPending = false;
  };
  const commitCamera = (next: TrajectoryGraphCamera | null) => {
    cancelPendingCommit();
    options.onCommit(next);
  };
  const setLocalCamera = (next: TrajectoryGraphCamera, commit = false) => {
    setCamera(next);
    if (commit) {
      commitCamera(next);
      return;
    }
    cameraCommitPending = true;
    if (cameraCommitTimer !== undefined) clearTimeout(cameraCommitTimer);
    cameraCommitTimer = setTimeout(() => {
      cameraCommitTimer = undefined;
      commitCamera(next);
    }, commitDelayMs);
  };
  const syncControlledCamera = (next: TrajectoryGraphCamera | null | undefined) => {
    if (cameraCommitPending) return;
    const nextCamera = next ? { ...next } : { ...DEFAULT_ROUTE_TOTALITY_CAMERA };
    if (!sameCamera(camera(), nextCamera)) setCamera(nextCamera);
  };
  const reset = () => {
    setCamera({ ...DEFAULT_ROUTE_TOTALITY_CAMERA });
    commitCamera(null);
  };
  const zoomAt = (nextScale: number, anchor?: RouteTotalityCameraPoint, commit = false) => {
    const viewport = options.getViewportSize();
    const point = anchor ?? { x: viewport.width / 2, y: viewport.height / 2 };
    const current = camera();
    const scale = clamp(nextScale, minScale, maxScale);
    const worldX = (point.x - current.x) / current.scale;
    const worldY = (point.y - current.y) / current.scale;
    setLocalCamera({ x: point.x - worldX * scale, y: point.y - worldY * scale, scale }, commit);
  };
  const viewPoint = (event: PointerEvent | WheelEvent): RouteTotalityCameraPoint => {
    const bounds = options.getSvg()?.getBoundingClientRect();
    const viewport = options.getViewportSize();
    if (!bounds || !bounds.width || !bounds.height) return { x: viewport.width / 2, y: viewport.height / 2 };
    return {
      x: (event.clientX - bounds.left) / bounds.width * viewport.width,
      y: (event.clientY - bounds.top) / bounds.height * viewport.height,
    };
  };
  const startPan = (event: PointerEvent) => {
    const svg = options.getSvg();
    if (event.button !== 0 || !svg) return;
    svg.setPointerCapture?.(event.pointerId);
    setPan({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      camera: camera(),
      moved: false,
    });
  };
  const movePan = (event: PointerEvent) => {
    const active = pan();
    const bounds = options.getSvg()?.getBoundingClientRect();
    if (!active || active.pointerId !== event.pointerId || !bounds || !bounds.width || !bounds.height) return;
    const viewport = options.getViewportSize();
    const dx = (event.clientX - active.startClientX) / bounds.width * viewport.width;
    const dy = (event.clientY - active.startClientY) / bounds.height * viewport.height;
    const moved = active.moved || Math.hypot(event.clientX - active.startClientX, event.clientY - active.startClientY) > 4;
    if (!moved) return;
    setPan({ ...active, moved });
    setLocalCamera({ ...active.camera, x: active.camera.x + dx, y: active.camera.y + dy });
  };
  const finishPan = (event: PointerEvent) => {
    const active = pan();
    if (!active || active.pointerId !== event.pointerId) return;
    if (!active.moved) {
      options.onTap();
    } else {
      commitCamera(camera());
    }
    const svg = options.getSvg();
    if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    setPan(null);
  };
  const zoomFromWheel = (event: WheelEvent) => {
    event.preventDefault();
    const normalizedDelta = clamp(event.deltaY, -100, 100);
    zoomAt(camera().scale * Math.exp(-normalizedDelta * .00065), viewPoint(event));
  };
  const cancelPan = () => {
    const active = pan();
    const svg = options.getSvg();
    if (active && svg?.hasPointerCapture(active.pointerId)) svg.releasePointerCapture(active.pointerId);
    setPan(null);
  };

  onCleanup(() => {
    cancelPendingCommit();
    cancelPan();
  });

  return {
    camera,
    dragging,
    setCamera: (nextCamera) => setCamera(nextCamera),
    isCommitPending: () => cameraCommitPending,
    cancelPendingCommit,
    cancelPan,
    syncControlledCamera,
    reset,
    zoomAt,
    startPan,
    movePan,
    finishPan,
    zoomFromWheel,
  };
}

function sameCamera(left: TrajectoryGraphCamera, right: TrajectoryGraphCamera) {
  return left.x === right.x && left.y === right.y && left.scale === right.scale;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
