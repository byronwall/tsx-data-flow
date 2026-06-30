import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServerFixtureProject as createFixtureProject } from "./fixture-project.mjs";
import { call } from "./http.mjs";
import {
  REPORT_VIEWS,
  analyzeProject,
  createAnalyzer,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  parseArgs,
} from "../../src/core.mjs";
import { fanOutAnchor, renderCodeMap } from "../../src/html/code-map.mjs";
import { peekReferences } from "../../src/html/source-peek.mjs";
import { createServer } from "../../src/server.mjs";

export const FIXTURE = {
  "src/Card.tsx": `
    export function Card(props: { title: string; count: number }) {
      const label = props.title ?? "Untitled";
      return <div class={label}>{props.count + 1}</div>;
    }
  `,
};

export {
  REPORT_VIEWS,
  analyzeProject,
  call,
  createAnalyzer,
  createFixtureProject,
  createServer,
  fanOutAnchor,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  parseArgs,
  peekReferences,
  readFile,
  renderCodeMap,
  resolve,
};
