import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BUILTIN_HIDDEN_COMPONENT_GLOB, type HiddenComponentPolicy } from "../api/hidden-component-policy";

const CONFIG_RELATIVE_PATH = ".tsx-dataflow/config.json";
const configSchema = z.strictObject({
  version: z.literal(1),
  topology: z.strictObject({
    hideGenericUiByDefault: z.boolean(),
    hiddenComponents: z.strictObject({
      include: z.array(z.string()),
      exclude: z.array(z.string()),
    }),
  }),
});

export function loadHiddenComponentPolicy(root: string): HiddenComponentPolicy {
  const projectRoot = path.resolve(root);
  const configFile = path.join(projectRoot, ...CONFIG_RELATIVE_PATH.split("/"));
  if (!fs.existsSync(configFile)) return builtInPolicy();
  if (!fs.statSync(configFile).isFile()) {
    throw configError(configFile, "the path exists but is not a regular file");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (error) {
    const reason = error instanceof SyntaxError ? error.message : String(error);
    throw configError(configFile, `invalid JSON (${reason})`);
  }

  const parsed = configSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw configError(configFile, `${issuePath(issue.path)}: ${issue.message}`);
  }

  const projectInclude = parsed.data.topology.hiddenComponents.include;
  const exclude = parsed.data.topology.hiddenComponents.exclude;
  validateGlobs(configFile, projectInclude, "topology.hiddenComponents.include");
  validateGlobs(configFile, exclude, "topology.hiddenComponents.exclude");
  const include = [BUILTIN_HIDDEN_COMPONENT_GLOB, ...projectInclude];
  return {
    enabledByDefault: parsed.data.topology.hideGenericUiByDefault,
    include: unique(include),
    exclude: unique(exclude),
    configPath: toProjectRelative(projectRoot, configFile),
  };
}

function builtInPolicy(): HiddenComponentPolicy {
  return {
    enabledByDefault: true,
    include: [BUILTIN_HIDDEN_COMPONENT_GLOB],
    exclude: [],
    configPath: null,
  };
}

function validateGlobs(configFile: string, patterns: string[], field: string) {
  for (const [index, pattern] of patterns.entries()) {
    if (!isValidGlob(pattern)) {
      throw configError(configFile, `${field}[${index}]: invalid POSIX glob ${JSON.stringify(pattern)}`);
    }
  }
}

function isValidGlob(pattern: string) {
  if (!pattern || pattern.trim() !== pattern || pattern.includes("\\") || pattern.includes("\0")) return false;
  if (pattern.startsWith("/") || pattern.split("/").some((segment) => segment === "..")) return false;
  if (pattern === "." || pattern === ".." || pattern.includes("//")) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end < 0 || end === index + 1 || pattern.slice(index + 1, end).includes("/")) return false;
      index = end;
    } else if (pattern[index] === "]" || pattern[index] === "{" || pattern[index] === "}") {
      return false;
    }
  }
  return true;
}

function issuePath(pathParts: PropertyKey[]) {
  if (!pathParts.length) return "config";
  return pathParts.map((part) => typeof part === "number" ? `[${part}]` : String(part)).join(".").replaceAll(".[", "[");
}

function configError(configFile: string, reason: string) {
  return new Error(`Invalid ${CONFIG_RELATIVE_PATH} at ${configFile}: ${reason}`);
}

function unique(values: string[]) { return [...new Set(values)]; }
function toProjectRelative(root: string, file: string) { return path.relative(root, file).replaceAll(path.sep, "/") || "."; }
