#!/usr/bin/env node
import {
  analyzeProject,
  renderAllReports,
  renderReport,
} from "../src/core";
import { parseArgs } from "../src/cli/args";
import { helpText } from "../src/cli/help";
import { writeAllReports, writeReport } from "../src/reports/output";

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    process.exit(0);
  }

  const report = await analyzeProject(args);

  if (args.compare) {
    const output = renderReport(report, args);
    if (args.out) {
      await writeReport(output, args.out);
      console.log(
        `Render-path data-flow compare report written to ${args.out}`,
      );
    } else {
      process.stdout.write(output);
    }
  } else if (args.view === "all") {
    const reports = renderAllReports(report, args);
    if (args.out) {
      const written = await writeAllReports(reports, args.out);
      console.log(
        `Wrote ${written.length} render-path data-flow reports to ${args.out}`,
      );
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
