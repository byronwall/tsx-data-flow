export const BUILTIN_HIDDEN_COMPONENT_GLOB = "**/components/ui/**";

export type HiddenComponentPolicy = {
  enabledByDefault: boolean;
  include: string[];
  exclude: string[];
  configPath: string | null;
};

/**
 * Match a project-relative component definition path against the effective
 * policy. Excludes are checked first so an exception can override both the
 * built-in convention and project-provided includes.
 */
export function matchedHiddenComponentRule(policy: HiddenComponentPolicy, file: string) {
  const normalized = normalizeProjectPath(file);
  if (!normalized) return null;
  if (policy.exclude.some((pattern) => matchesGlob(pattern, normalized))) return null;
  return policy.include.find((pattern) => matchesGlob(pattern, normalized)) ?? null;
}

export function normalizeProjectPath(file: string) {
  const normalized = file.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) return null;
  return normalized;
}

/**
 * This deliberately supports the small POSIX glob language used by the
 * configuration loader: `*`, `**`, `?`, and character classes. The loader
 * validates patterns before they reach this function, while keeping matching
 * available to the browser without a Node-only glob dependency.
 */
export function matchesGlob(pattern: string, file: string) {
  const normalizedPattern = pattern.replace(/^\.\//, "");
  const normalizedFile = normalizeProjectPath(file);
  if (!normalizedFile || !normalizedPattern) return false;
  return globRegex(normalizedPattern).test(normalizedFile);
}

function globRegex(pattern: string) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        source += "(?:.*/)?";
      } else {
        source += ".*";
      }
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character === "?") {
      source += "[^/]";
      continue;
    }
    if (character === "[") {
      const end = pattern.indexOf("]", index + 1);
      if (end < 0) return /$a/;
      const content = pattern.slice(index + 1, end);
      const negated = content.startsWith("!") || content.startsWith("^");
      const body = negated ? content.slice(1) : content;
      if (!body || body.includes("/")) return /$a/;
      source += `[${negated ? "^" : ""}${escapeCharacterClass(body)}]`;
      index = end;
      continue;
    }
    source += escapeRegexCharacter(character);
  }
  return new RegExp(`${source}$`);
}

function escapeRegexCharacter(character: string) {
  return /[\\^$+?.()|{}]/.test(character) ? `\\${character}` : character;
}

function escapeCharacterClass(value: string) {
  return value.replace(/[\\\]-]/g, "\\$&");
}
