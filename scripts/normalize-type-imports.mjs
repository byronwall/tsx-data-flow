import fs from "node:fs";
import path from "node:path";

for (const file of ["src", "bin", "scripts", "test"].flatMap(walk)) {
  if (!/\.(?:ts|tsx)$/.test(file) || file.endsWith(".d.ts")) continue;
  let text = fs.readFileSync(file, "utf8");
  const imports = new Map();
  let needsTypeScript = false;

  text = text.replace(/(\bfrom\s+["'][^"']+)\.(?:js|ts)(["'])/g, "$1$2");
  text = text.replace(/(\bimport\s+["'][^"']+)\.(?:js|ts)(["'])/g, "$1$2");

  text = text.replace(/typeof import\("typescript"\)/g, () => {
    needsTypeScript = true;
    return "typeof TypeScript";
  });
  text = text.replace(/import\("typescript"\)\.([A-Za-z_$][\w$]*)/g, (_, name) => {
    needsTypeScript = true;
    return `TypeScript.${name}`;
  });
  text = text.replace(/typeof import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g, (_, specifier, name) => {
    add(imports, specifier, name);
    return `typeof ${name}`;
  });
  text = text.replace(/import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g, (_, specifier, name) => {
    add(imports, specifier, name);
    return name;
  });

  const lines = [];
  if (needsTypeScript && !/import type \* as TypeScript from "typescript";/.test(text))
    lines.push('import type * as TypeScript from "typescript";');
  for (const [specifier, names] of [...imports].sort(([a], [b]) => a.localeCompare(b))) {
    const missing = [...names].filter(
      (name) => !new RegExp(`import type \\{[^}]*\\b${name}\\b[^}]*\\} from ["']${escape(specifier)}["']`).test(text),
    );
    if (missing.length) lines.push(`import type { ${missing.sort().join(", ")} } from "${specifier}";`);
  }
  if (lines.length) {
    const offset = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0;
    text = text.slice(0, offset) + lines.join("\n") + "\n" + text.slice(offset);
  }
  fs.writeFileSync(file, text);
}

function add(map, specifier, name) {
  const names = map.get(specifier) ?? new Set();
  names.add(name);
  map.set(specifier, names);
}
function escape(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
