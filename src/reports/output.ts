import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeReport(reportText: string, outPath: string) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, reportText);
}

// Write each rendered report into `outDir` under its per-view filename. Returns
// the list of paths written.
interface RenderedReport { filename: string; text: string }

export async function writeAllReports(reports: RenderedReport[], outDir: string) {
  const written: string[] = [];
  for (const report of reports) {
    const target = path.join(outDir, report.filename);
    await writeReport(report.text, target);
    written.push(target);
  }
  return written;
}
