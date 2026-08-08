import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/core";
import { routeTotalityForRoute } from "../src/analysis/route-data-session";
import { createAnalyzerFixtureProject } from "./helpers/fixture-project";

type ContinuityFingerprint = {
  counts: {
    declarations: number;
    providers: number;
    values: number;
    reads: number;
    consumers: number;
    links: number;
    relays: number;
    gaps: number;
  };
  ids: {
    declarationIds: string[];
    providerIds: string[];
    valueIds: string[];
    readIds: string[];
    consumerIds: string[];
    linkIds: string[];
  };
};

type ContinuityRouteTotality = NonNullable<ReturnType<typeof routeTotalityForRoute>>;

const nodeModuleSolidJs = `
  export interface ContextProviderProps<T> {
    value: T;
    children?: unknown;
  }

  export interface Context<T> {
    Provider: (props: ContextProviderProps<T>) => T;
  }

  export interface JSX {
    Element: unknown;
  }

  export function createContext<T>(value?: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
`;

function withSolidJs(files: Record<string, string>): Record<string, string> {
  return {
    "node_modules/solid-js/index.d.ts": nodeModuleSolidJs,
    ...files,
  };
}

async function collectContinuity(routePathPattern: string, files: Record<string, string>): Promise<{
  totality: ContinuityRouteTotality;
}> {
  const project = await createAnalyzerFixtureProject(files);
  const report = await analyzeProject(project.args);
  const route = report.routeData.routes.find((item) => item.pathPattern === routePathPattern);
  if (!route) throw new Error(`Route ${routePathPattern} was not found`);
  const totality = routeTotalityForRoute(report.routeData, route.key);
  if (!totality) throw new Error(`Missing totality for ${routePathPattern}`);
  return { totality };
}

function buildFingerprint(totality: ContinuityRouteTotality): ContinuityFingerprint {
  const continuity = totality.contextContinuity;
  return {
    counts: { ...continuity.counts },
    ids: {
      declarationIds: continuity.declarations.map((item) => item.id).sort(),
      providerIds: continuity.providers.map((item) => item.id).sort(),
      valueIds: continuity.values.map((item) => item.id).sort(),
      readIds: continuity.reads.map((item) => item.id).sort(),
      consumerIds: continuity.consumers.map((item) => item.id).sort(),
      linkIds: continuity.links.map((item) => item.id).sort(),
    },
  };
}

describe("route context continuity proof gaps", () => {
  it("links one Provider occurrence to multiple consumer occurrences", async () => {
    const { totality } = await collectContinuity("/", withSolidJs({
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const UserContext = solid.createContext({ label: "", active: false });

        export function FirstConsumer() {
          const context = solid.useContext(UserContext);
          return <p>{context.label}</p>;
        }

        export function SecondConsumer() {
          const context = solid.useContext(UserContext);
          return <p>{context.active ? "on" : "off"}</p>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { FirstConsumer, SecondConsumer, UserContext } from "../contexts";

        export default function Route() {
          const user = { label: "Ada", active: true };
          return (
            <UserContext.Provider value={user}>
              <FirstConsumer />
              <SecondConsumer />
            </UserContext.Provider>
          );
        }
      `,
    }));

    const continuity = totality.contextContinuity;

    expect(continuity.providers).toHaveLength(1);
    expect(continuity.reads).toHaveLength(2);
    expect(continuity.links).toHaveLength(2);
    expect(continuity.gaps).toHaveLength(0);

    const consumerIds = new Set(continuity.links.map((link) => link.consumerOccurrenceId));
    expect(consumerIds.size).toBe(2);

    const valueIds = new Set(continuity.links.map((link) => link.providedValueId));
    expect(valueIds.size).toBe(1);
  });

  it("assigns terminal ownership per consumer occurrence", async () => {
    const { totality } = await collectContinuity("/", withSolidJs({
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const UserContext = solid.createContext({ active: false });

        export function LeftConsumer() {
          const context = solid.useContext(UserContext);
          return <section><p>{context.active ? "left" : "none"}</p></section>;
        }

        export function RightConsumer() {
          const context = solid.useContext(UserContext);
          return <section><p>{context.active ? "right" : "none"}</p></section>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { LeftConsumer, RightConsumer, UserContext } from "../contexts";

        export default function Route() {
          return (
            <UserContext.Provider value={{ active: true }}>
              <LeftConsumer />
              <RightConsumer />
            </UserContext.Provider>
          );
        }
      `,
    }));

    const continuity = totality.contextContinuity;
    const linksByConsumer = new Map<string, (typeof continuity.links)[number][]>();

    expect(continuity.reads).toHaveLength(2);
    expect(continuity.links).toHaveLength(2);

    for (const link of continuity.links) {
      expect(link.terminalIds.length).toBeGreaterThan(0);
      const byConsumer = linksByConsumer.get(link.consumerOccurrenceId) ?? [];
      linksByConsumer.set(link.consumerOccurrenceId, [...byConsumer, link]);
      const consumer = continuity.consumers.find((item) => item.id === link.consumerOccurrenceId);
      expect(consumer).toBeDefined();
      const expectedTerminals = [...consumer!.terminalIds].sort();
      expect(link.terminalIds).toEqual(expect.arrayContaining(expectedTerminals));
      expect(link.terminalIds).toEqual(expectedTerminals);
    }

    expect(linksByConsumer.size).toBe(2);
    for (const links of linksByConsumer.values()) {
      expect(links).toHaveLength(1);
    }
  });

  it("does not make false joins when nested Providers shadow each other", async () => {
    const { totality } = await collectContinuity("/", withSolidJs({
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const ThemeContext = solid.createContext({ token: "outer" });

        export function OuterConsumer() {
          const context = solid.useContext(ThemeContext);
          return <p>{context.token}</p>;
        }

        export function InnerConsumer() {
          const context = solid.useContext(ThemeContext);
          return <p>{context.token}</p>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { OuterConsumer, InnerConsumer, ThemeContext } from "../contexts";

        function InnerProvider(props: { children: unknown }) {
          return <ThemeContext.Provider value={{ token: "inner" }}>{props.children}</ThemeContext.Provider>;
        }

        export default function Route() {
          return (
            <ThemeContext.Provider value={{ token: "outer" }}>
              <OuterConsumer />
              <InnerProvider>
                <InnerConsumer />
              </InnerProvider>
            </ThemeContext.Provider>
          );
        }
      `,
    }));

    const continuity = totality.contextContinuity;

    expect(continuity.providers.length).toBeGreaterThanOrEqual(2);
    expect(continuity.reads).toHaveLength(2);
    expect(continuity.links).toHaveLength(2);

    const linksByConsumer = new Map<string, string[]>();
    for (const link of continuity.links) {
      const prior = linksByConsumer.get(link.consumerOccurrenceId) ?? [];
      linksByConsumer.set(link.consumerOccurrenceId, [...prior, link.id]);
      expect(continuity.providers.some((provider) => provider.id === link.providerOccurrenceId)).toBe(true);
    }
    for (const links of linksByConsumer.values()) {
      expect(links).toHaveLength(1);
    }
    expect(new Set(continuity.links.map((link) => link.providerOccurrenceId)).size).toBe(2);
  });

  it("emits explicit ambiguous provider gaps for uncertain branch provider reachability", async () => {
    const { totality } = await collectContinuity("/", withSolidJs({
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const ThemeContext = solid.createContext({ token: "seed" });

        export function Consumer() {
          const context = solid.useContext(ThemeContext);
          return <p>{context.token}</p>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { Consumer, ThemeContext } from "../contexts";

        function Brancher(props: { children: unknown }) {
          return (
            <>
              {Math.random() > 0.5
                ? <ThemeContext.Provider value={{ token: "first" }}>{props.children}</ThemeContext.Provider>
                : <ThemeContext.Provider value={{ token: "second" }}>{props.children}</ThemeContext.Provider>}
            </>
          );
        }

        export default function Route() {
          return <Brancher><Consumer /></Brancher>;
        }
      `,
    }));

    const continuity = totality.contextContinuity;

    expect(continuity.reads).toHaveLength(1);
    expect(continuity.links).toHaveLength(0);
    expect(continuity.gaps.some((gap) => gap.reason === "ambiguous-provider")).toBe(true);
    expect(continuity.gaps.length).toBe(1);
  });

  it("stops dynamic provider shapes with explicit continuity gaps", async () => {
    const { totality } = await collectContinuity("/", withSolidJs({
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const FeatureContext = solid.createContext<{ count: number }>();

        export function Consumer() {
          const context = solid.useContext(FeatureContext);
          return <p>{(context as never as { count: number }).count}</p>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { Consumer, FeatureContext } from "../contexts";

        const providerCarrier = { wrapper: FeatureContext.Provider };

        export default function Route() {
          return (
            <providerCarrier.wrapper value={{ count: 7 }}>
              <Consumer />
            </providerCarrier.wrapper>
          );
        }
      `,
    }));

    const continuity = totality.contextContinuity;

    expect(continuity.reads).toHaveLength(1);
    expect(continuity.links).toHaveLength(0);
    expect(continuity.gaps.some((gap) => gap.reason === "missing-provider")).toBe(true);
    expect(continuity.gaps.length).toBe(1);
  });

  it("keeps continuity counts and IDs stable across repeated analysis", async () => {
    const files = {
      "src/contexts.tsx": `
        import * as solid from "solid-js";
        export const UserContext = solid.createContext({ value: "" });

        export function Header() {
          const context = solid.useContext(UserContext);
          return <p>{context.value}</p>;
        }

        export function Footer() {
          const context = solid.useContext(UserContext);
          return <p>{context.value}</p>;
        }
      `,
      "src/routes/index.tsx": `
        import { type JSX } from "solid-js";
        import { Header, Footer, UserContext } from "../contexts";

        export default function Route() {
          return (
            <UserContext.Provider value={{ value: "x" }}>
              <Header />
              <Footer />
            </UserContext.Provider>
          );
        }
      `,
    };

    const project = await createAnalyzerFixtureProject(withSolidJs(files));
    const firstReport = await analyzeProject(project.args);
    const secondReport = await analyzeProject(project.args);
    const firstRoute = firstReport.routeData.routes.find((item) => item.pathPattern === "/");
    if (!firstRoute) throw new Error("Route / was not found");
    const secondRoute = secondReport.routeData.routes.find((item) => item.pathPattern === "/");
    if (!secondRoute) throw new Error("Route / was not found");
    const first = routeTotalityForRoute(firstReport.routeData, firstRoute.key);
    const second = routeTotalityForRoute(secondReport.routeData, secondRoute.key);
    if (!first) throw new Error("Missing totality for first run");
    if (!second) throw new Error("Missing totality for second run");

    const firstFingerprint = buildFingerprint(first);
    const secondFingerprint = buildFingerprint(second);

    expect(secondFingerprint.counts).toEqual(firstFingerprint.counts);
    expect(secondFingerprint.ids).toEqual(firstFingerprint.ids);
  });
});
