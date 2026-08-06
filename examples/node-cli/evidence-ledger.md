# Node CLI evidence ledger

This is a handwritten expected ledger for the `record-report` command. It
describes source evidence in this fixture. It is not generated analyzer output.

## Selected scope

| Item | Evidence | Role |
| --- | --- | --- |
| Command registration | `package.json:5-7`, `bin.record-report` points to `src/cli.ts` | Scope entry metadata |
| Command entry guard | `src/cli.ts:134-143`, `isCommandEntry()` calls `main()` for the invoked file | Scope entry occurrence |
| Handler | `src/cli.ts:120-131`, `main()` catches command errors and calls `run()` | Command handler |
| Work function | `src/cli.ts:104-118`, `run()` owns the selected record flow | Selected scope body |

This scope has no route, URL pattern, component, JSX, or render-tree
dependency. Its output edges are command terminals.

## Origins and boundaries

| Stage | Exact occurrence | Role and boundary |
| --- | --- | --- |
| Arguments | `src/cli.ts:121`, default `process.argv.slice(2)` passed to `main()` | Command input origin |
| Environment | `src/cli.ts:122`, default `process.env` passed to `main()` | Environment input origin |
| Working directory | `src/cli.ts:123`, default `process.cwd()` passed to `main()` | Path-resolution context |
| Parsed options | `src/cli.ts:70-87`, `parseOptions()` resolves `--records`, `--output`, and `--min-total`, then applies env/default precedence | CLI adapter boundary |
| Records file | `src/records.ts:23-26`, `readFile(recordsPath, "utf8")` | Filesystem origin and external I/O boundary |
| JSON parse | `src/records.ts:25`, `JSON.parse(contents)` | Text-to-unknown representation boundary |
| Validation | `src/records.ts:28-34`, `validateRecords(rawRecords)` from `run()` | Unknown-to-`SalesRecord[]` trust boundary |
| Field selection | `src/records.ts:69-78`, `selectReportRows()` filters and packs `id`, `customer`, and `total` | Record-to-report-row representation boundary |
| Report pack | `src/records.ts:80-90`, `packReport()` aggregates selected rows | Rows-to-report boundary |

The input file's `status` field is validated but is intentionally not copied
into `ReportRow`. This makes the selection boundary visible.

## Comparable-story field roles

| Role | Field | Evidence | Treatment |
| --- | --- | --- | --- |
| Identity | `id` | `src/records.ts:3-7`, `41`, `53`, `74` | Validated and retained in each `ReportRow` |
| Label | `customer` | `src/records.ts:5`, `42`, `53`, `75` | Validated and retained in each `ReportRow` |
| Status | `status` | `src/records.ts:7`, `44`, `49-53` | Validated, then intentionally dropped from `ReportRow` |
| Measure | `total` | `src/records.ts:6`, `43`, `46-48`, `53`, `76`, `87` | Validated, retained, and aggregated in the report total |
| Owner | absent | No `owner` field appears in `SalesRecord`, `ReportRow`, or the sample records | Intentionally absent; no owner relation is inferred |

## Terminals

| Terminal | Exact occurrence | Claim |
| --- | --- | --- |
| Standard output | `src/cli.ts:93-95`, `process.stdout.write(serializeReport(report))` | A successful report is printed |
| File write | `src/cli.ts:97-102`, `writeFile(outputPath, serializeReport(report), "utf8")` | The same report is written to the configured output file |
| Return | `src/cli.ts:104-118`, `run()` returns `report` after the terminals are scheduled | The command flow remains callable without a process wrapper |
| Standard error | `src/cli.ts:129`, `process.stderr.write(`${message}\n`)` | Invalid input or I/O reaches the error terminal |
| Error status | `src/cli.ts:130`, `process.exitCode = 1` in `main()` | The failed command reports a non-zero status |

The file write is the one non-console side effect in the success path. The
console write is the required standard-output terminal.

## Proven relations

1. `package.json:5-7` → `src/cli.ts:134-143` → `src/cli.ts:120-131` is the
   registered command-to-handler relation.
2. `src/cli.ts:121-123` → `src/cli.ts:70-87` proves that arguments, environment,
   and working directory become the three command options. A flag wins over its
   environment value; an environment value wins over its default.
3. `src/cli.ts:109-110` → `src/records.ts:23-26` proves that the selected
   records path reaches one file read and JSON parse.
4. `src/cli.ts:110-112` → `src/records.ts:28-66` → `src/records.ts:69-78` proves
   the order `unknown JSON → validated records → selected report rows`.
5. `src/cli.ts:112-113` → `src/records.ts:80-90` proves that selected rows are
   packed into one aggregate report.
6. `src/cli.ts:115-116` → `src/cli.ts:93-102` proves that the packed report reaches
   standard output and one file side effect. `run()` also returns that report.

## Static occurrence and runtime multiplicity

The counts below are expected execution shape, not runtime telemetry. A static
`map`, `filter`, or `reduce` call and its callback body each occur once in the
source. Their runtime callback counts depend on the input collection and do
not change the number of static occurrences.

| Operation | Static occurrences | Runtime multiplicity for one successful invocation |
| --- | ---: | --- |
| Command entry guard | 1 | 1 check; `main()` runs only when the file is invoked directly |
| `process.argv`, `process.env`, `process.cwd()` reads | 1 each | 1 each |
| `readFile` and `JSON.parse` | 1 each | 1 each |
| Record validation map | 1 map call; 1 callback body | Map runs once; callback runs once per input record; the sample has 3 records |
| Selection filter | 1 filter call; 1 predicate body | Filter runs once; predicate runs once per input record |
| Selection map | 1 map call; 1 callback body | Map runs once; callback runs once per record that passes the threshold; the sample selects 2 |
| Report reduction | 1 reduce call; 1 reducer body | Reduce runs once; reducer runs once per selected row |
| Standard-output write | 1 | 1 |
| File write | 1 | 1 |

Calling the command again repeats the per-invocation operations. This ledger
does not claim process counts, file-system watcher counts, or any other runtime
measurement.

## Intentional gaps and external boundaries

- `readFile` accepts a local filesystem path. A value such as
  `https://example.test/records.json` is not a proven network origin; Node's
  `readFile` will reject it. This fixture intentionally has no `fetch` bridge.
- The `bin` metadata points to TypeScript source. The local development command
  uses the repository's external `tsx` runner. The ledger stops at that tooling
  boundary and does not claim package-manager, transpiler, or installed-binary
  behavior.
- `JSON.parse` and the file system are explicit boundaries. The ledger records
  their surrounding relations but does not claim knowledge of malformed input,
  missing files, or permissions beyond the error terminal in `main()`.
