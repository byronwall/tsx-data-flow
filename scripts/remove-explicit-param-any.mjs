import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

for (const file of ["src", "bin", "scripts"].flatMap(walk)) {
  if (!/\.(?:ts|tsx)$/.test(file) || file.endsWith(".d.ts")) continue;
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const visit = (node) => {
    if (ts.isParameter(node) && node.type?.kind === ts.SyntaxKind.AnyKeyword) {
      edits.push({ start: node.name.end, end: node.type.end });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  let output = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + output.slice(edit.end);
  }
  if (output !== text) fs.writeFileSync(file, output);
}

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}
