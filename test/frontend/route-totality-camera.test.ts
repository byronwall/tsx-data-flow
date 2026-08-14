// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRouteTotalityCamera } from "../../src/frontend/src/overview/route-totality-camera";

const disposers: Array<() => void> = [];

describe("route totality camera gesture ownership", () => {
  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose();
    vi.restoreAllMocks();
  });

  it("keeps stationary node and edge presses as click candidates", () => {
    const { controller, svg, onTap } = cameraFixture();
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const edge = document.createElementNS("http://www.w3.org/2000/svg", "g");

    controller.startPan(pointer(node));
    controller.movePan(pointer(node, { clientX: 3 }));
    controller.finishPan(pointer(node));
    controller.startPan(pointer(edge));
    controller.finishPan(pointer(edge));

    expect(svg.setPointerCapture).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
    expect(controller.dragging()).toBe(false);
  });

  it("captures after the threshold, pans, and suppresses the release click", () => {
    const { controller, svg, onCommit } = cameraFixture();

    controller.startPan(pointer(document.createElementNS("http://www.w3.org/2000/svg", "g")));
    controller.movePan(pointer(svg, { clientX: 5, clientY: 4 }));

    expect(svg.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(controller.camera()).toMatchObject({ x: 5, y: 4 });
    expect(controller.dragging()).toBe(true);

    controller.finishPan(pointer(svg, { clientX: 5, clientY: 4 }));

    expect(onCommit).toHaveBeenCalledWith({ x: 5, y: 4, scale: 1 });
    expect(svg.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(controller.dragging()).toBe(false);
    expect(controller.consumeSuppressedClick(mouseClick())).toBe(true);
    expect(controller.consumeSuppressedClick(mouseClick())).toBe(false);
  });

  it("clears only for an empty click and cleans pointercancel or lost capture", () => {
    const { controller, svg, onTap } = cameraFixture();

    controller.clearEmptySelection();
    expect(onTap).toHaveBeenCalledTimes(1);

    controller.startPan(pointer(svg));
    controller.movePan(pointer(svg, { clientX: 8 }));
    controller.finishPan(pointer(svg, { clientX: 8 }));
    expect(onTap).toHaveBeenCalledTimes(1);

    controller.startPan(pointer(svg, { pointerId: 2 }));
    controller.movePan(pointer(svg, { pointerId: 2, clientX: 8 }));
    controller.cancelPan();
    expect(controller.dragging()).toBe(false);
    expect(svg.releasePointerCapture).toHaveBeenCalledWith(2);

    controller.startPan(pointer(svg, { pointerId: 3 }));
    controller.movePan(pointer(svg, { pointerId: 3, clientX: 8 }));
    controller.finishPan(pointer(svg, { pointerId: 3 }));
    expect(controller.dragging()).toBe(false);
  });
});

function cameraFixture() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement & {
    setPointerCapture: ReturnType<typeof vi.fn>;
    hasPointerCapture: ReturnType<typeof vi.fn>;
    releasePointerCapture: ReturnType<typeof vi.fn>;
  };
  const captured = new Set<number>();
  svg.setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
  svg.hasPointerCapture = vi.fn((pointerId: number) => captured.has(pointerId));
  svg.releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ width: 100, height: 100, top: 0, right: 100, bottom: 100, left: 0, x: 0, y: 0, toJSON: () => ({}) });
  const onTap = vi.fn();
  const onCommit = vi.fn();
  let controller!: ReturnType<typeof createRouteTotalityCamera>;
  let dispose!: () => void;
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    controller = createRouteTotalityCamera({
      initialCamera: null,
      getViewportSize: () => ({ width: 100, height: 100 }),
      getSvg: () => svg,
      onCommit,
      onTap,
    });
  });
  disposers.push(dispose);
  return { controller, svg, onTap, onCommit };
}

function pointer(target: EventTarget, overrides: Partial<PointerEvent> = {}) {
  return { button: 0, pointerId: 1, clientX: 0, clientY: 0, target, ...overrides } as PointerEvent;
}

function mouseClick() {
  return { detail: 1 } as MouseEvent;
}
