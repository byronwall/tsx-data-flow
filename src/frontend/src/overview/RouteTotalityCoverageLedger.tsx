import { For } from "solid-js";
import type { RouteTotalityLedgerSection } from "./route-totality-graph-state";

export function RouteTotalityCoverageLedger(props: { items: readonly RouteTotalityLedgerSection[]; inspector?: boolean }) {
  return <section classList={{ "route-totality-ledger-inspector": props.inspector }} class="route-totality-ledger" aria-label="Route totality coverage ledger">
    <div><h3>Coverage record</h3><p>Compact route marks and edges render here. Exact evidence stays in the sidebar section below. This record names gaps, budget state, and unresolved handoffs.</p></div>
    <div class="route-totality-ledger-sections"><For each={props.items}>{(section) => <section>
      <h3>{section.label}</h3>
      <ul class="route-totality-ledger-list"><For each={section.items}>{(item) => <li><strong>{item.label}</strong><span>{item.status} · {item.detail}</span></li>}</For></ul>
    </section>}</For></div>
  </section>;
}
