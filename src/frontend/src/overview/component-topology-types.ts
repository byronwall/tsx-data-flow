// Shared graph shapes for the force layout engine (component-topology-layout.ts)
// and the Route Totality surface layout that feeds it.

export type ComponentTopologyNode = {
  id: string;
  kind: "component" | "context" | "source" | "boundary";
  label: string;
  file: string | null;
  line: number | null;
  /** Stable source-backed identity; null means a label-only graph step. */
  sourceIdentity: string | null;
  routeEntry: boolean;
  incomingCount: number;
  outgoingCount: number;
  depth: number;
};

export type ComponentTopologyEdge = {
  id: string;
  from: string;
  to: string;
  kind: "renders" | "handoff" | "provides" | "consumes" | "loads";
  confidence: "proven" | "inferred";
  count: number;
  via?: string[];
};

export type ComponentTopology = {
  nodes: ComponentTopologyNode[];
  edges: ComponentTopologyEdge[];
  totals: { components: number; contexts: number; sources: number; inferredEdges: number };
};

export type ComponentTopologyLayoutNode = ComponentTopologyNode & { x: number; y: number; radius: number; terminal: boolean };
export type ComponentTopologyLayoutEdge = ComponentTopologyEdge & { fromNode: ComponentTopologyLayoutNode; toNode: ComponentTopologyLayoutNode };
