import * as TypeScript from "typescript";
import type { AnalysisCancellationToken } from "./cancellation";
import { ProgramValueSummaryAnalyzer } from "./program-value-summary";
import {
  type ContextContinuityGap,
  type RouteContextContinuity,
} from "./context-continuity";
import type {
  RouteOccurrenceSurface,
  RouteRenderOccurrence,
} from "./route-occurrence-surface";
import type { SourceLocation } from "./scope-seam";
import {
  containsLocation,
  contextDeclarationForExpression,
  contextWrapperForCall,
  locationForContextNode,
  locationKey,
  providerTagFor,
  type SolidContextDeclaration,
  type SolidProviderSyntax,
} from "./solid-route-context-continuity-support";
import { isCanonicalSolidCall } from "./solid-symbols";
import { inside, resolvedSymbol } from "./route-occurrence-support";
import {
  ancestryFor,
  compareById,
  contextDeclarationId,
  nodeKey,
  proof,
  spanSize,
  stableId,
  unsupportedBoundaryBetween,
} from "./solid-route-context-continuity-route-support";
import {
  buildContextDeclarations,
  buildProviderSites,
  type ProviderSite,
} from "./solid-route-context-continuity-record-support";
import {
  buildContextRelays,
  collectRelayReadOwners,
  collectRelayReadSyntaxes,
} from "./solid-route-context-continuity-relay-support";
import {
  buildContextReadsAndLinks,
  type ContextReadSyntax,
  type UnresolvedProviderSite,
} from "./solid-route-context-continuity-read-support";

const VISIT_CHECK_INTERVAL = 128;

export function buildSolidRouteContextContinuity(
  ts: typeof TypeScript,
  program: TypeScript.Program,
  root: string,
  surface: RouteOccurrenceSurface,
  cancellation: AnalysisCancellationToken,
): RouteContextContinuity {
  return new SolidRouteContextCompiler(ts, program, root, surface, cancellation).build();
}

class SolidRouteContextCompiler {
  private readonly checker: TypeScript.TypeChecker;
  private readonly files: TypeScript.SourceFile[];
  private readonly declarations = new Map<string, SolidContextDeclaration>();
  private readonly providerSyntaxes: SolidProviderSyntax[] = [];
  private readonly unresolvedProviderNodes: Array<{ node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement; opening: TypeScript.JsxOpeningLikeElement }> = [];
  private readonly readSyntaxes: ContextReadSyntax[] = [];
  private readonly unownedReadSyntaxes: ContextReadSyntax[] = [];
  private readonly handledReadCalls = new Set<string>();
  private readonly gaps: ContextContinuityGap[] = [];
  private readonly gapKeys = new Set<string>();
  private readonly valueAnalyzer: ProgramValueSummaryAnalyzer;

  constructor(
    private readonly ts: typeof TypeScript,
    program: TypeScript.Program,
    private readonly root: string,
    private readonly surface: RouteOccurrenceSurface,
    private readonly cancellation: AnalysisCancellationToken,
  ) {
    this.checker = program.getTypeChecker();
    this.valueAnalyzer = new ProgramValueSummaryAnalyzer(ts, program, root);
    this.files = program.getSourceFiles()
      .filter((file) => !file.isDeclarationFile && inside(root, file.fileName))
      .sort((left, right) => left.fileName.localeCompare(right.fileName));
  }

  build(): RouteContextContinuity {
    this.scanProgram();
    const relevantContextIdentities = new Set([
      ...this.providerSyntaxes.map((syntax) => syntax.context.compilerIdentity),
      ...this.readSyntaxes.map((syntax) => syntax.context.compilerIdentity),
    ]);
    let declarations = buildContextDeclarations(
      this.ts,
      this.checker,
      this.root,
      new Map([...this.declarations].filter(([identity]) => relevantContextIdentities.has(identity))),
      this.valueAnalyzer,
    );
    let providers = buildProviderSites(
      this.ts,
      this.checker,
      this.root,
      this.providerSyntaxes,
      declarations,
      this.valueAnalyzer,
      this.cancellation,
      (node) => this.occurrencesForNode(node),
      (context, node, label) => this.addOwnershipGap(context, node, label),
    );
    const relayReadSyntaxes = collectRelayReadSyntaxes(this.ts, this.checker, this.root, this.unownedReadSyntaxes, providers);
    for (const syntax of relayReadSyntaxes) {
      this.declarations.set(syntax.context.compilerIdentity, syntax.context);
      relevantContextIdentities.add(syntax.context.compilerIdentity);
    }
    declarations = buildContextDeclarations(
      this.ts,
      this.checker,
      this.root,
      new Map([...this.declarations].filter(([identity]) => relevantContextIdentities.has(identity))),
      this.valueAnalyzer,
    );
    providers = buildProviderSites(
      this.ts,
      this.checker,
      this.root,
      this.providerSyntaxes,
      declarations,
      this.valueAnalyzer,
      this.cancellation,
      (node) => this.occurrencesForNode(node),
      (context, node, label) => this.addOwnershipGap(context, node, label),
    );
    const relayReadOwners = collectRelayReadOwners(this.ts, this.checker, this.root, providers);
    const allReadSyntaxes = [...this.readSyntaxes, ...relayReadSyntaxes];
    const unresolvedProviders = this.unresolvedProviderNodes.flatMap(({ node, opening }) => this.occurrencesForNode(node).map((host): UnresolvedProviderSite => ({
      host,
      openingLocation: locationForContextNode(this.root, opening),
      elementLocation: locationForContextNode(this.root, node),
    })));
    const { reads, consumers, links } = buildContextReadsAndLinks(
      this.ts,
      this.checker,
      this.root,
      this.surface,
      allReadSyntaxes,
      declarations,
      providers,
      unresolvedProviders,
      this.cancellation,
      (node) => this.occurrencesForNode(node).length > 0 ? this.occurrencesForNode(node) : relayReadOwners.get(nodeKey(node)) ?? [],
      (provider, consumerId) => this.providerReachesConsumer(provider, consumerId),
      (provider, consumerId) => this.providerBranchReachesConsumer(provider, consumerId),
      (provider, consumerId) => unsupportedBoundaryBetween(this.surface, provider.host.id, consumerId, provider.elementLocation)?.location ?? null,
      (gap) => this.addGap(gap),
    );
    const relays = buildContextRelays(
      this.ts,
      this.checker,
      this.root,
      providers,
      reads,
      consumers,
      links,
      this.surface,
    );
    const records = [
      ...declarations.map((item) => item.record),
      ...declarations.flatMap((item) => item.defaultValue ? [item.defaultValue] : []),
      ...providers.flatMap((item) => [item.occurrence, item.value]),
      ...reads,
      ...consumers,
      ...links,
      ...relays,
    ];
    const status = this.gaps.length > 0 || this.surface.status !== "complete" || records.some((record) => record.status !== "proven")
      ? "partial"
      : "complete";
    const sortedDeclarations = declarations.map((item) => item.record).sort(compareById);
    const sortedProviders = providers.map((item) => item.occurrence).sort(compareById);
    const sortedValues = [
      ...declarations.flatMap((item) => item.defaultValue ? [item.defaultValue] : []),
      ...providers.map((item) => item.value),
    ].sort(compareById);
    const sortedReads = reads.sort(compareById);
    const sortedConsumers = consumers.sort(compareById);
    const sortedLinks = links.sort(compareById);
    const sortedRelays = relays.sort(compareById);
    const sortedGaps = [...this.gaps].sort(compareById);
    return {
      status,
      counts: {
        declarations: sortedDeclarations.length,
        providers: sortedProviders.length,
        values: sortedValues.length,
        reads: sortedReads.length,
        consumers: sortedConsumers.length,
        links: sortedLinks.length,
        relays: sortedRelays.length,
        gaps: sortedGaps.length,
      },
      declarations: sortedDeclarations,
      providers: sortedProviders,
      values: sortedValues,
      reads: sortedReads,
      consumers: sortedConsumers,
      links: sortedLinks,
      relays: sortedRelays,
      gaps: sortedGaps,
    };
  }

  private scanProgram(): void {
    let visited = 0;
    for (const file of this.files) {
      this.cancellation.throwIfCancelled();
      const visit = (node: TypeScript.Node) => {
        visited += 1;
        if (visited % VISIT_CHECK_INTERVAL === 0) this.cancellation.throwIfCancelled();
        if (this.ts.isVariableDeclaration(node) && node.initializer) this.scanContextDeclaration(node);
        if (this.ts.isJsxElement(node) || this.ts.isJsxSelfClosingElement(node)) this.scanProvider(node);
        if (this.ts.isCallExpression(node)) this.scanContextRead(node);
        this.ts.forEachChild(node, visit);
      };
      visit(file);
    }
    this.cancellation.throwIfCancelled();
  }

  private scanContextDeclaration(node: TypeScript.VariableDeclaration): void {
    const initializer = node.initializer && this.ts.isExpression(node.initializer) ? node.initializer : null;
    if (!initializer) return;
    const context = contextDeclarationForExpression(this.ts, this.checker, this.root, node.name as TypeScript.Expression);
    if (!context || context.declaration !== node) return;
    this.declarations.set(context.compilerIdentity, context);
  }

  private scanProvider(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement): void {
    if (!this.hasRouteDefinitionForNode(node)) return;
    const tag = providerTagFor(this.ts, this.checker, this.root, node, this.valueAnalyzer);
    if (!tag) {
      this.scanUnsupportedProviderWrapper(node);
      return;
    }
    if (tag.kind === "dynamic-provider") {
      if (tag.context) {
        this.declarations.set(tag.context.compilerIdentity, tag.context);
        this.providerSyntaxes.push({ context: tag.context, node, opening: tag.opening, valueExpression: null });
      } else this.unresolvedProviderNodes.push({ node, opening: tag.opening });
      this.addGap({
        reason: "dynamic-provider-identity",
        label: `Provider identity at ${tag.opening.tagName.getText(node.getSourceFile())} is not compiler-resolved to one createContext declaration.`,
        location: locationForContextNode(this.root, tag.opening),
        contextDeclarationId: tag.context ? contextDeclarationId(tag.context) : null,
        providerOccurrenceId: null,
        readId: null,
        consumerOccurrenceId: null,
        status: "unsupported",
        proof: proof("compiler-symbol", "The Provider tag does not resolve to a statically identified context declaration.", [locationForContextNode(this.root, tag.opening)], "unsupported"),
      });
      return;
    }
    this.declarations.set(tag.syntax.context.compilerIdentity, tag.syntax.context);
    this.providerSyntaxes.push(tag.syntax);
    if (!tag.syntax.valueExpression) {
      this.addGap({
        reason: "unsupported-syntax",
        label: `Provider ${tag.syntax.context.label} has no statically visible value expression.`,
        location: locationForContextNode(this.root, tag.syntax.opening),
        contextDeclarationId: contextDeclarationId(tag.syntax.context),
        providerOccurrenceId: null,
        readId: null,
        consumerOccurrenceId: null,
        status: "unsupported",
        proof: proof("jsx-tag", "The Provider occurrence is source-backed, but its value attribute is missing or dynamic.", [locationForContextNode(this.root, tag.syntax.opening)], "unsupported"),
      });
    }
  }

  private scanUnsupportedProviderWrapper(node: TypeScript.JsxElement | TypeScript.JsxSelfClosingElement): void {
    const opening = this.ts.isJsxElement(node) ? node.openingElement : node;
    if (!this.ts.isIdentifier(opening.tagName) || !/Provider$/.test(opening.tagName.text)) return;
    const resolved = resolvedSymbol(this.ts, this.checker, opening.tagName);
    if (!resolved?.declaration || !inside(this.root, resolved.declaration.getSourceFile().fileName)) return;
    const location = locationForContextNode(this.root, opening);
    this.addGap({
      reason: "unsupported-wrapper",
      label: `First-party ${opening.tagName.text} wrapper is not treated as a context Provider without compiler identity proof.`,
      location,
      contextDeclarationId: null,
      providerOccurrenceId: null,
      readId: null,
      consumerOccurrenceId: null,
      status: "unsupported",
      proof: proof("jsx-tag", "A first-party Provider-shaped wrapper was retained as an explicit unsupported boundary.", [location], "unsupported"),
    });
  }

  private scanContextRead(node: TypeScript.CallExpression): void {
    if (this.handledReadCalls.has(nodeKey(node))) return;
    const routeOwned = this.hasRouteDefinitionForNode(node);
    if (isCanonicalSolidCall(this.ts, this.checker, node, "useContext")) {
      if (node.arguments.length !== 1) {
        this.addDynamicReadGap(node, "useContext requires one compiler-resolved context argument.");
        return;
      }
      const context = contextDeclarationForExpression(this.ts, this.checker, this.root, node.arguments[0]);
      if (!context) {
        this.addDynamicReadGap(node, "useContext context argument is not compiler-resolved to one createContext declaration.");
        return;
      }
      this.declarations.set(context.compilerIdentity, context);
      const syntax = { context, call: node, underlyingCalls: [node], wrapper: false };
      (routeOwned ? this.readSyntaxes : this.unownedReadSyntaxes).push(syntax);
      return;
    }
    const wrapper = contextWrapperForCall(this.ts, this.checker, this.root, node);
    if (wrapper === "unsupported") {
      const location = locationForContextNode(this.root, node);
      this.addGap({
        reason: "unsupported-wrapper",
        label: `First-party context wrapper ${node.expression.getText(node.getSourceFile())} is not a compiler-proven single-context read.`,
        location,
        contextDeclarationId: null,
        providerOccurrenceId: null,
        readId: null,
        consumerOccurrenceId: null,
        status: "unsupported",
        proof: proof("return-expression", "The first-party wrapper does not return one statically identified useContext result.", [location], "unsupported"),
      });
      return;
    }
    if (!wrapper) return;
    for (const underlying of wrapper.underlyingCalls) this.handledReadCalls.add(nodeKey(underlying));
    this.declarations.set(wrapper.context.compilerIdentity, wrapper.context);
    const syntax = { context: wrapper.context, call: node, underlyingCalls: wrapper.underlyingCalls, wrapper: true };
    (routeOwned ? this.readSyntaxes : this.unownedReadSyntaxes).push(syntax);
  }

  private addDynamicReadGap(node: TypeScript.CallExpression, detail: string): void {
    const location = locationForContextNode(this.root, node);
    this.addGap({
      reason: "dynamic-context-identity",
      label: detail,
      location,
      contextDeclarationId: null,
      providerOccurrenceId: null,
      readId: null,
      consumerOccurrenceId: null,
      status: "unsupported",
      proof: proof("compiler-symbol", detail, [location], "unsupported"),
    });
  }

  private providerReachesConsumer(provider: ProviderSite, consumerId: string): boolean {
    return this.providerBranchReachesConsumer(provider, consumerId);
  }

  private providerBranchReachesConsumer(
    provider: { host: RouteRenderOccurrence; elementLocation: SourceLocation },
    consumerId: string,
  ): boolean {
    if (provider.host.id === consumerId) return false;
    const ancestry = ancestryFor(this.surface, provider.host.id, consumerId);
    if (ancestry.length < 2 || ancestry[0] !== provider.host.id) return false;
    const firstChild = ancestry[1];
    const child = this.surface.occurrences.find((occurrence) => occurrence.id === firstChild);
    if (!child) return false;
    if (containsLocation(provider.elementLocation, child.callSite)) return true;
    return this.surface.slotForwarding.some((slot) =>
      slot.occurrenceId === provider.host.id
      && containsLocation(provider.elementLocation, slot.sourceLocation)
      && slot.callerChildOccurrenceIds.includes(firstChild),
    );
  }

  private occurrencesForNode(node: TypeScript.Node): RouteRenderOccurrence[] {
    const location = locationForContextNode(this.root, node);
    const definitions = this.surface.definitions
      .filter((definition) => definition.declaration && containsLocation(definition.declaration, location))
      .sort((left, right) => spanSize(left.declaration!) - spanSize(right.declaration!));
    const definition = definitions[0];
    if (!definition) return [];
    return this.surface.occurrences
      .filter((occurrence) => occurrence.definitionSourceIdentity === definition.sourceIdentity)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private hasRouteDefinitionForNode(node: TypeScript.Node): boolean {
    const location = locationForContextNode(this.root, node);
    return this.surface.definitions.some((definition) => definition.declaration && containsLocation(definition.declaration, location));
  }

  private addOwnershipGap(context: SolidContextDeclaration, node: TypeScript.Node, label: string): void {
    const location = locationForContextNode(this.root, node);
    this.addGap({
      reason: "ambiguous-ownership",
      label,
      location,
      contextDeclarationId: contextDeclarationId(context),
      providerOccurrenceId: null,
      readId: null,
      consumerOccurrenceId: null,
      status: "partial",
      proof: proof("parent-occurrence", label, [location], "partial"),
    });
  }

  private addGap(gap: Omit<ContextContinuityGap, "id">): void {
    const key = JSON.stringify([gap.reason, gap.contextDeclarationId, gap.providerOccurrenceId, gap.readId, gap.consumerOccurrenceId, gap.label, gap.location && locationKey(gap.location)]);
    if (this.gapKeys.has(key)) return;
    this.gapKeys.add(key);
    this.gaps.push({ ...gap, id: stableId("context-gap", [key]) });
  }
}
