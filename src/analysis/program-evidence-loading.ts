import path from "node:path";
import * as TypeScript from "typescript";

/** Load the TypeScript program used by eager and lazy evidence collection. */
export function programForRoot(root: string): TypeScript.Program {
  const configFile = TypeScript.findConfigFile(root, TypeScript.sys.fileExists, "tsconfig.json");
  const configResult = configFile ? TypeScript.readConfigFile(configFile, TypeScript.sys.readFile) : null;
  if (configResult?.error) throw new Error(TypeScript.flattenDiagnosticMessageText(configResult.error.messageText, "\n"));
  const parsed = configResult
    ? TypeScript.parseJsonConfigFileContent(configResult.config, TypeScript.sys, path.dirname(configFile!))
    : { fileNames: TypeScript.sys.readDirectory(root, [".ts", ".tsx"]), options: { noEmit: true, allowJs: false } };
  return TypeScript.createProgram(parsed.fileNames, parsed.options);
}
