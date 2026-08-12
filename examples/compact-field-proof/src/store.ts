import { readFile } from "node:fs/promises";

export type Project = { id: string; name: string; ownerName: string; code: string };
export type ProjectSnapshot = { projects: Project[]; unrelated: Array<{ name: string }> };

export async function readProjectSnapshot(): Promise<ProjectSnapshot> {
  return JSON.parse(await readFile("projects.json", "utf8")) as ProjectSnapshot;
}
