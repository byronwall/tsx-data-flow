#!/usr/bin/env node
import {
  analyzeProject,
  helpText,
  parseArgs,
  renderReport,
  writeReport,
} from "../src/core.mjs";

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(helpText());
    process.exit(0);
  }

  const report = await analyzeProject(args);
  const output = renderReport(report, args);
  if (args.out) {
    await writeReport(output, args.out);
    console.log(`Render-path data-flow report written to ${args.out}`);
  } else {
    process.stdout.write(output);
  }

  if (args.failOnRegression && report.baseline?.regressed) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
