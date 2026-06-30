export interface FanOutRootInfo {
  label: string;
  kind?: string;
  def?: { file: string; line: number } | null;
}

export function fanOutRootsFor(sink: {
  roots?: string[];
  rootInfos?: FanOutRootInfo[];
}): FanOutRootInfo[];

export function fanOutIdentity(
  sink: { file?: string; renderContext?: { component?: string | null } },
  info: FanOutRootInfo,
): { key: string; label: string };
