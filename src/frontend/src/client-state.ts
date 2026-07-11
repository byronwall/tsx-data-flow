export const OVERVIEW_COLUMNS_KEY = "tsxdf.overviewHiddenCols";

export function readHiddenColumns(
  storage: Pick<Storage, "getItem"> | null,
  validColumns: readonly string[],
): Set<string> {
  if (!storage) return new Set();
  try {
    const value: unknown = JSON.parse(
      storage.getItem(OVERVIEW_COLUMNS_KEY) ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return new Set();
    }
    return new Set(
      validColumns.filter(
        (column: string) => (value as Record<string, unknown>)[column] === true,
      ),
    );
  } catch {
    return new Set();
  }
}

export function writeHiddenColumns(
  storage: Pick<Storage, "setItem"> | null,
  hidden: ReadonlySet<string>,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      OVERVIEW_COLUMNS_KEY,
      JSON.stringify(Object.fromEntries([...hidden].map((key) => [key, true]))),
    );
  } catch {
    // Preferences are best-effort in restricted browser contexts.
  }
}
