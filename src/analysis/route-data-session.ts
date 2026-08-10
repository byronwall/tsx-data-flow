import type * as TypeScript from "typescript";
import type { Sink } from "../types";
import { attachRouteTotalityFindings } from "./route-totality-finding-attachments";
import type { EvidenceRelationProvider } from "./evidence-relation-provider";
import {
  buildRouteTotalityRecords,
  type RouteTotalityRecord,
} from "./route-data-totality";
import type { RouteTotalitySelectedSource } from "./route-totality-selected-source";
import type { RouteDataAnalysis, RouteRecord } from "./route-data";
import type { ScopeCandidate } from "./scope-seam";
import {
  NO_ANALYSIS_CANCELLATION,
  type AnalysisCancellationToken,
} from "./cancellation";

export interface RouteDataTotalitySession {
  get(
    routeKey: string,
    selectedSource: RouteTotalitySelectedSource | null,
    cancellation?: AnalysisCancellationToken,
  ): RouteTotalityRecord | null;
}

const sessions = new WeakMap<object, RouteDataTotalitySession>();

export function createRouteDataTotalitySession(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  routes: readonly RouteRecord[],
  provider: EvidenceRelationProvider,
  candidates: readonly ScopeCandidate[],
  findings: readonly Sink[],
): RouteDataTotalitySession {
  const routesByKey = new Map(routes.map((route) => [route.key, route]));
  const recordsBySelection = new Map<string, RouteTotalityRecord>();

  return {
    get(routeKey, selectedSource, cancellation = NO_ANALYSIS_CANCELLATION) {
      cancellation.throwIfCancelled();
      const cacheKey = `${routeKey}\u0000${selectedSource?.key ?? ""}`;
      const retained = recordsBySelection.get(cacheKey);
      if (retained) return retained;
      const route = routesByKey.get(routeKey);
      if (!route) return null;
      const records = buildRouteTotalityRecords(ts, program, root, [route], provider, candidates, selectedSource, cancellation);
      cancellation.throwIfCancelled();
      const attached = attachRouteTotalityFindings(ts, program, root, records, findings, cancellation)[0] ?? null;
      cancellation.throwIfCancelled();
      if (attached) recordsBySelection.set(cacheKey, attached);
      return attached;
    },
  };
}

export function registerRouteDataTotalitySession(
  analysis: RouteDataAnalysis,
  session: RouteDataTotalitySession,
): void {
  sessions.set(analysis, session);
}

export function routeTotalityForRoute(
  analysis: RouteDataAnalysis,
  routeKey: string,
  selectedSource: RouteTotalitySelectedSource | null = null,
  cancellation: AnalysisCancellationToken = NO_ANALYSIS_CANCELLATION,
): RouteTotalityRecord | null {
  cancellation.throwIfCancelled();
  const retained = selectedSource
    ? null
    : analysis.routeTotality.find((record) => record.routeKey === routeKey) ?? null;
  return retained
    ?? sessions.get(analysis)?.get(routeKey, selectedSource, cancellation)
    ?? null;
}
