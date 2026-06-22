#!/usr/bin/env node
import {
  analyzeProject,
  helpText,
  parseArgs,
  renderAllReports,
  renderReport,
  writeAllReports,
  writeReport,
} from "../src/core.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    process.exit(0);
  }

  const report = await analyzeProject(args);

  if (args.view === "all") {
    const reports = renderAllReports(report, args);
    if (args.out) {
      const written = await writeAllReports(reports, args.out);
      console.log(`Wrote ${written.length} render-path data-flow reports to ${args.out}`);
      for (const file of written) console.log(`  ${file}`);
    } else {
      process.stdout.write(reports.map((entry) => entry.text).join("\n"));
    }
  } else {
    const output = renderReport(report, args);
    if (args.out) {
      await writeReport(output, args.out);
      console.log(`Render-path data-flow report written to ${args.out}`);
    } else {
      process.stdout.write(output);
    }
  }

  if (args.failOnRegression && report.baseline?.regressed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
