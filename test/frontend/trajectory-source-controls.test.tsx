// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RouteDataInventory } from "../../src/api/contracts";
import { TrajectorySourcePicker } from "../../src/frontend/src/overview/TrajectorySourcePicker";

const source: RouteDataInventory["sources"][number] = {
  key: "source:doc",
  label: "Doc row",
  kind: "prisma",
  file: "src/services/docs.queries.ts",
  line: 71,
  routeKeys: ["route:doc"],
  consumerLabel: "fetchDoc",
  handoffProven: true,
  typeName: null,
  typeText: "{ id: string; html: string | null; markdown: string | null }",
  shapeKind: "object",
  fields: [
    { key: "id", typeText: "string", optional: false },
    { key: "html", typeText: "string | null", optional: false },
    { key: "markdown", typeText: "string | null", optional: false },
  ],
  totalFields: 3,
  evidenceId: "e:doc",
  handoffFields: [],
};

afterEach(cleanup);

describe("trajectory source controls", () => {
  it("presents readable source identity and dismisses the picker without changing selection", async () => {
    const onSelect = vi.fn();
    const { container } = render(() => <div><TrajectorySourcePicker sources={[source]} selectedKey={source.key} onSelect={onSelect} /><button type="button">Outside</button></div>);
    const details = container.querySelector("details")!;

    await fireEvent.click(screen.getByLabelText("Choose route data source"));
    expect(details.open).toBe(true);
    expect(container.textContent).toContain("fetchDoc");
    expect(container.textContent).toContain("docs.queries.ts:71");
    expect(container.querySelector(".trajectory-source-picker > summary code")?.textContent).toBe("id, html, markdown");
    expect(container.textContent).not.toContain("Source shape");
    expect([...container.querySelectorAll(".trajectory-source-fields button")].map((button) => button.textContent)).toEqual([
      "idstring",
      "htmlstring | null",
      "markdownstring | null",
    ]);

    await fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(details.open).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByLabelText("Choose route data source"));
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Choose route data source"));
  });
});
