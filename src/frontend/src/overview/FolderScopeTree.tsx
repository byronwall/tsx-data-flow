import { For, Show, createSignal, untrack } from "solid-js";

export interface FolderScope { path: string; count: number }
interface FolderNode { name: string; path: string; count: number; children: FolderNode[] }

export function FolderScopeTree(props: { scopes: FolderScope[]; selected: string | null; total: number; onSelect: (path: string) => void }) {
  const tree = () => buildFolderTree(props.scopes);
  const choose = (path: string, target: HTMLElement) => { props.onSelect(path); const popover = target.closest("[data-popover]"); popover?.classList.remove("open"); popover?.querySelector("[data-popover-trigger]")?.setAttribute("aria-expanded", "false"); };
  return <div class="folder-tree-popover popover" data-popover><button type="button" class="folder-tree-trigger popover-trigger" data-popover-trigger aria-expanded="false"><span class="mono">{props.selected ?? "Whole repository"}</span><span class="meta">{props.selected ? props.scopes.find((scope) => scope.path === props.selected)?.count ?? 0 : props.total} areas</span><span aria-hidden="true">▾</span></button><div class="folder-tree-panel popover-panel"><div class="folder-tree-root"><button type="button" classList={{ selected: props.selected === null }} onClick={(event) => choose("", event.currentTarget)}><span>Whole repository</span><span class="meta">{props.total}</span></button></div><ul class="folder-tree" role="tree"><For each={tree()}>{(node) => <FolderTreeNode node={node} depth={0} selected={props.selected} onSelect={choose} />}</For></ul></div></div>;
}

function FolderTreeNode(props: { node: FolderNode; depth: number; selected: string | null; onSelect: (path: string, target: HTMLElement) => void }) {
  const [expanded, setExpanded] = createSignal(untrack(() => props.depth < 2));
  return <li role="treeitem" aria-expanded={props.node.children.length ? expanded() : undefined}><div class="folder-tree-row" style={{ "--tree-depth": props.depth }}><Show when={props.node.children.length} fallback={<span class="folder-tree-spacer" />}><button type="button" class="folder-tree-expander" aria-label={`${expanded() ? "Collapse" : "Expand"} ${props.node.path}`} onClick={() => setExpanded(!expanded())}>{expanded() ? "▾" : "▸"}</button></Show><button type="button" class="folder-tree-choice" classList={{ selected: props.selected === props.node.path }} onClick={(event) => props.onSelect(props.node.path, event.currentTarget)}><span class="mono">{props.node.name}</span><span class="meta">{props.node.count}</span></button></div><Show when={expanded() && props.node.children.length}><ul role="group"><For each={props.node.children}>{(child) => <FolderTreeNode node={child} depth={props.depth + 1} selected={props.selected} onSelect={props.onSelect} />}</For></ul></Show></li>;
}

export function buildFolderTree(scopes: FolderScope[]): FolderNode[] {
  const roots: FolderNode[] = []; const byPath = new Map<string, FolderNode>();
  for (const scope of scopes) {
    const parts = scope.path.split("/"); const name = parts.at(-1) ?? scope.path;
    const node = { name, path: scope.path, count: scope.count, children: [] as FolderNode[] }; byPath.set(scope.path, node);
    const parentPath = parts.slice(0, -1).join("/"); const parent = byPath.get(parentPath);
    if (parent) parent.children.push(node); else roots.push(node);
  }
  return roots;
}
