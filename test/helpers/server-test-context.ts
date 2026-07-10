import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServerFixtureProject as createFixtureProject } from "./fixture-project.js";
import { call } from "./http.js";
import {
  REPORT_VIEWS,
  analyzeProject,
  createAnalyzer,
  fanOutEntriesForFile,
  fanOutEntriesGlobal,
  parseArgs,
} from "../../src/core.js";
import { fanOutAnchor, renderCodeMap } from "../../src/html/code-map.js";
import { peekReferences } from "../../src/html/source-peek.js";
import { createServer } from "../../src/server.ts";

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
