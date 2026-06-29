// Global identifiers and language keywords that the local file context cannot
// resolve and that surface as `unknown-source` roots, but are never an ownable
// domain "source" a developer could centralize. Excluded from fan-out ranking.
const NON_FAN_OUT_GLOBALS = new Set([
  "undefined",
  "null",
  "NaN",
  "Infinity",
  "Math",
  "JSON",
  "Object",
  "Array",
  "Number",
  "String",
  "Boolean",
  "Date",
  "console",
  "window",
  "document",
  "globalThis",
]);

// Fan-out ranks the sources a value flows from. Literals/primitives (`0`,
// `false`, `""`, `[]`) and bare parameter objects (`props`) are not actionable
// "sources" - a developer cannot own or centralize them - so they are excluded,
// as are unresolved language globals (`undefined`, `Math`). Property reads off
// a parameter (`props.meta`) and named locals are kept.
export function fanOutRootsFor(sink) {
  const infos =
    sink.rootInfos ??
    sink.roots.map((root) => ({ label: root, kind: "source" }));
  return infos.filter(
    (info) =>
      info.kind !== "literal" &&
      info.kind !== "parameter" &&
      // BUG-1: an "operation" root is a synthetic placeholder for a no-input
      // operation (e.g. an empty `{}` object-pack). It is not a shared source and
      // must never collapse into a global fan-out entry keyed on its bare label.
      info.kind !== "operation" &&
      !NON_FAN_OUT_GLOBALS.has(info.label),
  );
}

// FANOUT-1: a `prop-read` root (`props.isOpen`) is local to the component that
// declares those props - two different components reading `props.isOpen` are
// different values. Keying fan-out by the bare expression text merged unrelated
// props across the whole repo and inflated the consumer count. So scope
// prop-derived roots by their owning component; module-level/hook/import/context
// roots stay globally keyed because those genuinely are one shared source.
const PROP_SCOPED_FANOUT_KINDS = new Set(["prop-read"]);

export function fanOutIdentity(sink, info) {
  if (PROP_SCOPED_FANOUT_KINDS.has(info.kind)) {
    const component = sink.renderContext?.component ?? null;
    const scope = component ?? sink.file ?? "";
    return {
      key: `${scope}::${info.label}`,
      label: component ? `${component} › ${info.label}` : info.label,
    };
  }
  return { key: info.label, label: info.label };
}
