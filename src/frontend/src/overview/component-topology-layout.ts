import type {
  ComponentTopology,
  ComponentTopologyEdge,
  ComponentTopologyLayoutEdge,
  ComponentTopologyLayoutNode,
  ComponentTopologyNode,
} from "./component-topology-model";

type SimulationNode = ComponentTopologyLayoutNode & { vx: number; vy: number; lastDx: number; lastDy: number };
type SimulationLink = {
  edge: ComponentTopologyEdge;
  from: SimulationNode;
  to: SimulationNode;
  terminalLeaf: boolean;
  parentFanOut: number;
  subtreeCohesionWeight: number;
};
type FringeDesires = {
  fringeById: Map<string, number>;
  massById: Map<string, number>;
  neighborsById: Map<string, Set<string>>;
};

const COMPACTION_START_TICK = 88;
const COMPACTION_END_TICK = 160;
const COOLING_TIME_CONSTANT = 55;
const MAX_SIMULATION_STEP = 12;
const MAX_SEPARATION_STEP = 12;
const DIAGONAL_COMPONENT = Math.SQRT1_2;
const TERMINAL_DIRECTION = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
const LABEL_CHARACTER_WIDTH = 7.8;
const LABEL_GAP = 5;
const LABEL_LIMIT = 24;

export type ComponentTopologyLayoutSettings = {
  simulationTicks: number;
  separationPasses: number;
  targetLinkDistance: number;
  markGap: number;
  collisionStrength: number;
  fringeStrength: number;
};

export type ComponentTopologyForceVector = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  magnitude: number;
};

export type ComponentTopologyLayoutStep = "tick" | "separate";

export type ComponentTopologyLayout = {
  nodes: ComponentTopologyLayoutNode[];
  edges: ComponentTopologyLayoutEdge[];
  forces: ComponentTopologyForceVector[];
  width: number;
  height: number;
};

export const DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS: ComponentTopologyLayoutSettings = {
  simulationTicks: 456,
  separationPasses: 0,
  targetLinkDistance: 160,
  markGap: 12,
  collisionStrength: 1.7,
  fringeStrength: 2.1,
};

export function layoutComponentTopology(
  topology: ComponentTopology,
  width = 1200,
  height = 760,
  options: Partial<ComponentTopologyLayoutSettings> = {},
  steps: readonly ComponentTopologyLayoutStep[] = [],
): ComponentTopologyLayout {
  if (!topology.nodes.length) return { nodes: [], edges: [], forces: [], width, height };
  const settings = { ...DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS, ...options };
  const simulationTicks = Math.max(0, Math.round(settings.simulationTicks));
  const separationPasses = Math.max(0, Math.round(settings.separationPasses));
  const debugTickCount = steps.filter((step) => step === "tick").length;
  const debugSeparationCount = steps.length - debugTickCount;
  const initialSimulationTicks = Math.max(0, simulationTicks - debugTickCount);
  const initialSeparationPasses = Math.max(0, separationPasses - debugSeparationCount);
  const spacing = clamp(Math.sqrt(topology.nodes.length / 100), 1, 1.8);
  const showAllLabels = topology.nodes.length <= 60;
  width *= spacing;
  height *= spacing;
  const maximumDepth = Math.max(1, ...topology.nodes.map((node) => node.depth));
  const visibleIncoming = new Map<string, Set<string>>();
  const visibleOutgoing = new Map<string, Set<string>>();
  for (const edge of topology.edges) {
    visibleIncoming.set(edge.to, (visibleIncoming.get(edge.to) ?? new Set()).add(edge.from));
    visibleOutgoing.set(edge.from, (visibleOutgoing.get(edge.from) ?? new Set()).add(edge.to));
  }
  const topologyNodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const fringeDesires = buildFringeDesires(topology.nodes, visibleIncoming, visibleOutgoing);
  const ownedSubtreeSizes = buildOwnedSubtreeSizes(topology.nodes, visibleIncoming, visibleOutgoing);
  const sourceIds = topology.nodes.filter((node) => node.kind === "source").map((node) => node.id).sort(lexical);
  const contextIds = topology.nodes.filter((node) => node.kind === "context").map((node) => node.id).sort(lexical);
  const anchors = new Map(topology.nodes.map((node) => {
    const jitter = hashUnit(node.id);
    if (node.kind === "source") {
      const ordinal = sourceIds.indexOf(node.id);
      return [node.id, {
        x: 44 + (ordinal % 3) * 132,
        y: 36 + Math.floor(ordinal / 3) * 54,
      }];
    }
    if (node.kind === "context") {
      const ordinal = contextIds.indexOf(node.id);
      const consumers = topology.edges
        .filter((edge) => edge.from === node.id && edge.kind === "consumes")
        .map((edge) => topologyNodeById.get(edge.to))
        .filter((consumer): consumer is ComponentTopologyNode => Boolean(consumer));
      const consumerDepth = consumers.length
        ? consumers.reduce((sum, consumer) => sum + consumer.depth, 0) / consumers.length
        : node.depth;
      const consumerX = 64 + consumerDepth / maximumDepth * (width - 250);
      const spread = (ordinal - (contextIds.length - 1) / 2) * 84;
      return [node.id, {
        x: clamp(consumerX + settings.targetLinkDistance * .7 + spread, 180, width - 220),
        y: 38 + (ordinal % 2) * 26 + Math.floor(ordinal / 4) * 48,
      }];
    }
    const depthRatio = node.depth / maximumDepth;
    const yRatio = depthRatio * .72 + jitter * .28;
    return [node.id, {
      x: 64 + depthRatio * (width - 250),
      y: 40 + yRatio * (height - 80),
    }];
  }));
  const positions: SimulationNode[] = topology.nodes.map((node) => {
    const jitter = hashUnit(node.id);
    const anchor = anchors.get(node.id)!;
    const terminal = node.kind === "component"
      && !node.routeEntry
      && (visibleIncoming.get(node.id)?.size ?? 0) > 0
      && (visibleOutgoing.get(node.id)?.size ?? 0) === 0;
    return {
      ...node,
      x: anchor.x + (node.kind === "component" || node.kind === "boundary" ? (jitter - .5) * 28 : 0),
      y: anchor.y,
      vx: 0,
      vy: 0,
      lastDx: 0,
      lastDy: 0,
      radius: node.kind === "component" ? Math.min(10, 3.5 + Math.log2(node.incomingCount + node.outgoingCount + 1) * 1.25) : 6.5,
      terminal,
    };
  });
  const byId = new Map(positions.map((node) => [node.id, node]));
  const links = buildSimulationLinks(topology.edges, byId, visibleIncoming, visibleOutgoing, ownedSubtreeSizes);

  let tickIndex = 0;
  for (; tickIndex < initialSimulationTicks; tickIndex += 1) {
    runSimulationTick(positions, links, anchors, fringeDesires, tickIndex, width, height, showAllLabels, spacing, settings);
  }
  for (let pass = 0; pass < initialSeparationPasses; pass += 1) {
    runSeparationPass(positions, width, height, showAllLabels, spacing, settings);
  }
  for (const step of steps) {
    if (step === "tick") {
      runSimulationTick(positions, links, anchors, fringeDesires, tickIndex, width, height, showAllLabels, spacing, settings);
      tickIndex += 1;
    } else {
      runSeparationPass(positions, width, height, showAllLabels, spacing, settings);
    }
  }

  const previewPositions = positions.map((node) => ({ ...node }));
  const previewById = new Map(previewPositions.map((node) => [node.id, node]));
  const previewLinks = buildSimulationLinks(topology.edges, previewById, visibleIncoming, visibleOutgoing, ownedSubtreeSizes);
  runSimulationTick(previewPositions, previewLinks, anchors, fringeDesires, tickIndex, width, height, showAllLabels, spacing, settings);
  const forces: ComponentTopologyForceVector[] = previewPositions.map((node) => ({
    id: node.id,
    x: byId.get(node.id)?.x ?? node.x - node.lastDx,
    y: byId.get(node.id)?.y ?? node.y - node.lastDy,
    dx: node.lastDx,
    dy: node.lastDy,
    magnitude: Math.hypot(node.lastDx, node.lastDy),
  }));
  const laidOutNodes = positions.map(({ vx: _vx, vy: _vy, lastDx: _lastDx, lastDy: _lastDy, ...node }) => node);
  const laidOutById = new Map(laidOutNodes.map((node) => [node.id, node]));
  const edges = topology.edges.flatMap((edge) => {
    const fromNode = laidOutById.get(edge.from); const toNode = laidOutById.get(edge.to);
    return fromNode && toNode ? [{ ...edge, fromNode, toNode }] : [];
  });
  const rightLabelMargin = Math.max(0, ...laidOutNodes
    .filter((node) => hasVisibleLabel(node, showAllLabels))
    .map((node) => labelWidth(node))) + LABEL_GAP + 36;
  return { nodes: laidOutNodes, edges, forces, width: width + rightLabelMargin, height };
}

function runSimulationTick(
  positions: SimulationNode[],
  links: SimulationLink[],
  anchors: Map<string, { x: number; y: number }>,
  fringeDesires: FringeDesires,
  tick: number,
  width: number,
  height: number,
  showAllLabels: boolean,
  spacing: number,
  settings: ComponentTopologyLayoutSettings,
) {
  const compaction = clamp((tick - COMPACTION_START_TICK) / (COMPACTION_END_TICK - COMPACTION_START_TICK), 0, 1);
  const cooling = Math.exp(-tick / COOLING_TIME_CONSTANT);
  const directionalCooling = Math.max(.18, cooling);
  const center = {
    x: positions.reduce((sum, node) => sum + node.x, 0) / positions.length,
    y: positions.reduce((sum, node) => sum + node.y, 0) / positions.length,
  };
  const anchorWeight = .009 * (1 - compaction * .84);
  const springWeight = .02 + compaction * .04;
  for (const node of positions) {
    const target = anchors.get(node.id) ?? node;
    node.vx += (target.x - node.x) * anchorWeight * cooling;
    node.vy += (target.y - node.y) * anchorWeight * .89 * cooling;
    node.vx += (center.x - node.x) * .002 * compaction * cooling;
    node.vy += (center.y - node.y) * .002 * compaction * cooling;
  }
  applyFringeAvoidance(positions, fringeDesires, cooling, settings);
  for (const link of links) {
    const { from, to, edge } = link;
    const dx = to.x - from.x; const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desired = desiredLinkDistance(link, settings.targetLinkDistance);
    const terminalTetherWeight = link.terminalLeaf
      ? .03
      : to.terminal ? .012 * compaction : 0;
    const distanceError = distance - desired;
    const force = distanceError * springWeight * cooling
      + Math.max(0, distanceError) * (terminalTetherWeight + link.subtreeCohesionWeight);
    const fx = dx / distance * force; const fy = dy / distance * force;
    from.vx += fx; from.vy += fy; to.vx -= fx; to.vy -= fy;
    const specialParent = from.kind === "context" && edge.kind === "consumes";
    const angleWeight = .007 + (to.terminal ? .04 : 0) + (specialParent ? .035 : 0);
    applyAngleDesire(from, to, {
      x: specialParent ? -DIAGONAL_COMPONENT : to.terminal ? TERMINAL_DIRECTION.x : DIAGONAL_COMPONENT,
      y: specialParent ? DIAGONAL_COMPONENT : to.terminal ? TERMINAL_DIRECTION.y : DIAGONAL_COMPONENT,
    }, desired, angleWeight * directionalCooling);
    if (specialParent) {
      applyMinimumVerticalOffset(from, to, desired * .36, (.38 + compaction * .27) * directionalCooling);
      applyMaximumHorizontalOffset(from, to, 0, (.2 + compaction * .15) * directionalCooling);
    } else if (to.terminal) {
      applyMinimumVerticalOffset(from, to, desired * .2, (.12 + compaction * .1) * directionalCooling);
      applyMinimumHorizontalOffset(from, to, desired * .16, (.1 + compaction * .08) * directionalCooling);
    }
  }
  applyCollisionForces(positions, showAllLabels, spacing, cooling, settings);
  for (const node of positions) {
    node.vx *= .78;
    node.vy *= .78;
    moveNode(node, width, height, MAX_SIMULATION_STEP);
  }
}

function buildSimulationLinks(
  edges: ComponentTopologyEdge[],
  byId: Map<string, SimulationNode>,
  incoming: Map<string, Set<string>>,
  outgoing: Map<string, Set<string>>,
  ownedSubtreeSizes: Map<string, number>,
) {
  const pairMultiplicity = new Map<string, number>();
  for (const edge of edges) {
    const key = directedPairKey(edge.from, edge.to);
    pairMultiplicity.set(key, (pairMultiplicity.get(key) ?? 0) + 1);
  }
  return edges.flatMap((edge): SimulationLink[] => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const pairKey = directedPairKey(edge.from, edge.to);
    const subtreeSize = ownedSubtreeSizes.get(pairKey) ?? 0;
    const cohesionForPair = subtreeSize > 0 && !to.terminal
      ? Math.min(.028, .0045 * Math.sqrt(subtreeSize))
      : 0;
    return [{
      edge,
      from,
      to,
      terminalLeaf: to.terminal
        && (incoming.get(to.id)?.size ?? 0) === 1
        && (outgoing.get(to.id)?.size ?? 0) === 0,
      parentFanOut: outgoing.get(from.id)?.size ?? 0,
      subtreeCohesionWeight: cohesionForPair / (pairMultiplicity.get(pairKey) ?? 1),
    }];
  });
}

function desiredLinkDistance(link: SimulationLink, targetLinkDistance: number) {
  const baseDistance = targetLinkDistance
    + (link.edge.kind === "loads" ? 12 : link.edge.kind === "renders" ? -6 : 0);
  if (!link.terminalLeaf) return baseDistance;
  const fanOutAllowance = clamp((link.parentFanOut - 1) / 5, 0, 1) * .22;
  return baseDistance * (.58 + fanOutAllowance);
}

function buildOwnedSubtreeSizes(
  nodes: ComponentTopologyNode[],
  incoming: Map<string, Set<string>>,
  outgoing: Map<string, Set<string>>,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const ownedChildren = new Map<string, string[]>();
  for (const node of nodes) {
    if (!isTreeComponent(node)) continue;
    const parentIds = [...(incoming.get(node.id) ?? [])];
    if (parentIds.length !== 1 || !isTreeComponent(nodeById.get(parentIds[0]))) continue;
    const parentId = parentIds[0];
    ownedChildren.set(parentId, [...(ownedChildren.get(parentId) ?? []), node.id]);
  }
  const sizesByNode = new Map<string, number>();
  const visiting = new Set<string>();
  const subtreeSize = (id: string): number => {
    const cached = sizesByNode.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const size = 1 + (ownedChildren.get(id) ?? [])
      .reduce((sum, childId) => sum + subtreeSize(childId), 0);
    visiting.delete(id);
    sizesByNode.set(id, size);
    return size;
  };
  const result = new Map<string, number>();
  for (const [parentId, childIds] of ownedChildren) {
    for (const childId of childIds) {
      if (!(outgoing.get(parentId)?.has(childId))) continue;
      result.set(directedPairKey(parentId, childId), subtreeSize(childId));
    }
  }
  return result;
}

function directedPairKey(from: string, to: string) {
  return `${from}\u0000${to}`;
}

function isTreeComponent(node: ComponentTopologyNode | undefined) {
  return node?.kind === "component" || node?.kind === "boundary";
}

function buildFringeDesires(
  nodes: ComponentTopologyNode[],
  incoming: Map<string, Set<string>>,
  outgoing: Map<string, Set<string>>,
): FringeDesires {
  const distanceToTerminal = new Map<string, number>();
  const pending = nodes
    .filter((node) => isFringeCandidate(node) && (incoming.get(node.id)?.size ?? 0) > 0 && (outgoing.get(node.id)?.size ?? 0) === 0)
    .map((node) => node.id);
  for (const id of pending) distanceToTerminal.set(id, 0);
  for (let index = 0; index < pending.length; index += 1) {
    const childId = pending[index];
    const nextDistance = (distanceToTerminal.get(childId) ?? 0) + 1;
    for (const parentId of incoming.get(childId) ?? []) {
      if ((distanceToTerminal.get(parentId) ?? Number.POSITIVE_INFINITY) <= nextDistance) continue;
      distanceToTerminal.set(parentId, nextDistance);
      pending.push(parentId);
    }
  }

  const fringeById = new Map<string, number>();
  const massById = new Map<string, number>();
  const neighborsById = new Map<string, Set<string>>();
  for (const node of nodes) {
    const neighbors = new Set([...(incoming.get(node.id) ?? []), ...(outgoing.get(node.id) ?? [])]);
    const degree = neighbors.size;
    const distance = distanceToTerminal.get(node.id) ?? Number.POSITIVE_INFINITY;
    const terminalProximity = distance === 0 ? 1 : distance === 1 ? .64 : distance === 2 ? .32 : 0;
    const looseConnection = clamp((4 - degree) / 4, 0, 1);
    const fringe = isFringeCandidate(node)
      ? terminalProximity * (.65 + looseConnection * .35)
      : 0;
    const connectedness = clamp(degree / 6, 0, 1);
    const mass = clamp((.25 + connectedness * .75) * (1 - fringe * .62), .12, 1);
    fringeById.set(node.id, fringe);
    massById.set(node.id, mass);
    neighborsById.set(node.id, neighbors);
  }
  return { fringeById, massById, neighborsById };
}

function applyFringeAvoidance(
  positions: SimulationNode[],
  desires: FringeDesires,
  cooling: number,
  settings: ComponentTopologyLayoutSettings,
) {
  if (settings.fringeStrength <= 0) return;
  const neighborhoodRadius = clamp(settings.targetLinkDistance * 2.25, 120, 420);
  const forceCooling = .35 + cooling * .65;

  for (const node of positions) {
    const fringe = desires.fringeById.get(node.id) ?? 0;
    if (fringe <= 0) continue;
    const graphNeighbors = desires.neighborsById.get(node.id) ?? new Set();
    let avoidanceX = 0;
    let avoidanceY = 0;
    let localPressure = 0;
    for (const other of positions) {
      if (other.id === node.id || graphNeighbors.has(other.id)) continue;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (distance >= neighborhoodRadius) continue;
      const proximity = 1 - distance / neighborhoodRadius;
      const pressure = proximity * proximity * (.4 + (desires.massById.get(other.id) ?? .25) * 1.6);
      avoidanceX += dx / distance * pressure;
      avoidanceY += dy / distance * pressure;
      localPressure += pressure;
    }
    let directionMagnitude = Math.hypot(avoidanceX, avoidanceY);
    if (directionMagnitude < .01 && localPressure > 0) {
      const angle = hashUnit(`fringe:${node.id}`) * Math.PI * 2;
      avoidanceX = Math.cos(angle) * Math.min(.25, localPressure * .04);
      avoidanceY = Math.sin(angle) * Math.min(.25, localPressure * .04);
      directionMagnitude = Math.hypot(avoidanceX, avoidanceY);
    }
    if (directionMagnitude <= 0) continue;
    const requestedForce = directionMagnitude * .72 * fringe * settings.fringeStrength * forceCooling;
    const force = Math.min(5, requestedForce);
    node.vx += avoidanceX / directionMagnitude * force;
    node.vy += avoidanceY / directionMagnitude * force;
  }
}

function isFringeCandidate(node: ComponentTopologyNode) {
  return !node.routeEntry && (node.kind === "component" || node.kind === "boundary");
}

function runSeparationPass(
  positions: SimulationNode[],
  width: number,
  height: number,
  showAllLabels: boolean,
  spacing: number,
  settings: ComponentTopologyLayoutSettings,
) {
  for (const node of positions) {
    node.vx = 0;
    node.vy = 0;
  }
  applyCollisionForces(positions, showAllLabels, spacing, 1, settings, false);
  for (const node of positions) {
    node.vx *= .78;
    node.vy *= .78;
    moveNode(node, width, height, MAX_SEPARATION_STEP);
    node.vx = 0;
    node.vy = 0;
  }
}

function moveNode(node: SimulationNode, width: number, height: number, maximumStep: number) {
  const magnitude = Math.hypot(node.vx, node.vy);
  if (magnitude > maximumStep) {
    const scale = maximumStep / magnitude;
    node.vx *= scale;
    node.vy *= scale;
  }
  const previousX = node.x;
  const previousY = node.y;
  node.x = clamp(node.x + node.vx, 24, width - 24);
  node.y = clamp(node.y + node.vy, 24, height - 24);
  node.lastDx = node.x - previousX;
  node.lastDy = node.y - previousY;
}

function applyCollisionForces(
  positions: SimulationNode[],
  showAllLabels: boolean,
  spacing: number,
  cooling: number,
  settings: ComponentTopologyLayoutSettings,
  includeAmbientRepulsion = true,
) {
  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    const left = positions[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
      const right = positions[rightIndex];
      const dx = right.x - left.x; const dy = right.y - left.y;
      const distanceSquared = Math.max(36, dx * dx + dy * dy);
      const distance = Math.sqrt(distanceSquared);
      const markMinimum = markExtent(left) + markExtent(right) + settings.markGap;
      if (distance < markMinimum) {
        const markForce = (markMinimum - distance) * settings.collisionStrength * (.4 + cooling);
        const markFx = dx / distance * markForce;
        const markFy = dy / distance * markForce;
        left.vx -= markFx;
        left.vy -= markFy;
        right.vx += markFx;
        right.vy += markFy;
      }
      const collision = labelCollision(left, right, showAllLabels, spacing);
      const force = collision
        ? collision.force * cooling * (settings.collisionStrength / DEFAULT_COMPONENT_TOPOLOGY_LAYOUT_SETTINGS.collisionStrength)
        : includeAmbientRepulsion ? Math.min(.24, 110 / distanceSquared) * cooling : 0;
      const fx = collision
        ? collision.x * force
        : dx / distance * force;
      const fy = collision
        ? collision.y * force
        : dy / distance * force;
      left.vx -= fx; left.vy -= fy; right.vx += fx; right.vy += fy;
    }
  }
}

function applyAngleDesire(
  from: SimulationNode,
  to: SimulationNode,
  direction: { x: number; y: number },
  distance: number,
  weight: number,
) {
  const xForce = (direction.x * distance - (to.x - from.x)) * weight;
  const yForce = (direction.y * distance - (to.y - from.y)) * weight;
  from.vx -= xForce;
  from.vy -= yForce;
  to.vx += xForce;
  to.vy += yForce;
}

function applyMinimumVerticalOffset(from: SimulationNode, to: SimulationNode, minimumOffset: number, weight: number) {
  const force = Math.max(0, minimumOffset - (to.y - from.y)) * weight;
  from.vy -= force;
  to.vy += force;
}

function applyMinimumHorizontalOffset(from: SimulationNode, to: SimulationNode, minimumOffset: number, weight: number) {
  const force = Math.max(0, minimumOffset - (to.x - from.x)) * weight;
  from.vx -= force;
  to.vx += force;
}

function applyMaximumHorizontalOffset(from: SimulationNode, to: SimulationNode, maximumOffset: number, weight: number) {
  const force = Math.max(0, to.x - from.x - maximumOffset) * weight;
  from.vx += force;
  to.vx -= force;
}

function hasVisibleLabel(node: ComponentTopologyNode, showAllLabels: boolean) {
  const degree = node.incomingCount + node.outgoingCount;
  return showAllLabels || node.routeEntry || node.kind !== "component" || degree >= 8;
}

function labelWidth(node: ComponentTopologyNode) {
  return Math.min(LABEL_LIMIT, node.label.length) * LABEL_CHARACTER_WIDTH;
}

function collisionBox(node: SimulationNode, showAllLabels: boolean) {
  const extent = markExtent(node);
  const right = hasVisibleLabel(node, showAllLabels)
    ? extent + LABEL_GAP + labelWidth(node)
    : extent;
  return {
    centerX: (right - extent) / 2,
    halfWidth: (right + extent) / 2,
    halfHeight: Math.max(extent, 8),
  };
}

function markExtent(node: ComponentTopologyLayoutNode) {
  return node.kind === "context" ? node.radius * Math.SQRT2 : node.radius;
}

function labelCollision(left: SimulationNode, right: SimulationNode, showAllLabels: boolean, spacing: number) {
  const leftBox = collisionBox(left, showAllLabels);
  const rightBox = collisionBox(right, showAllLabels);
  const dx = right.x + rightBox.centerX - (left.x + leftBox.centerX);
  const dy = right.y - left.y;
  const gap = 18 * spacing;
  const overlapX = leftBox.halfWidth + rightBox.halfWidth + gap - Math.abs(dx);
  const overlapY = leftBox.halfHeight + rightBox.halfHeight + gap - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return null;
  if (overlapX < overlapY) return { x: dx < 0 ? -1 : 1, y: 0, force: overlapX * .48 };
  return { x: 0, y: dy < 0 ? -1 : 1, force: overlapY * .48 };
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function lexical(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function hashUnit(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 0xffffffff;
}
