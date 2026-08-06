import type { ViewerProfile } from "./types";

export async function loadViewer(): Promise<ViewerProfile> {
  const response = await fetch("/viewer.json");
  if (!response.ok) throw new Error(`Viewer request failed: ${response.status}`);
  return validateViewer(await response.json());
}

function validateViewer(payload: unknown): ViewerProfile {
  if (!payload || typeof payload !== "object") {
    throw new Error("Viewer payload must be an object");
  }

  const viewer = payload as Record<string, unknown>;
  if (typeof viewer.name !== "string" || typeof viewer.team !== "string") {
    throw new Error("Viewer payload is missing name or team");
  }

  return { name: viewer.name, team: viewer.team };
}
