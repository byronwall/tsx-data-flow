import { readFile } from "node:fs/promises";
import type { ProjectSnapshot } from "../../store";

async function loadProjects(): Promise<ProjectSnapshot> {
  return JSON.parse(await readFile("projects.json", "utf8")) as ProjectSnapshot;
}

export async function GET() {
  return Response.json(loadProjects());
}
