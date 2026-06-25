---
name: feedback-walkthrough
description: Turn a screen-recording walkthrough "context package" (transcript + frames + audio of the user voicing opinions while clicking through the tsx-dataflow web UI) into a detailed, code-grounded findings/plan document, then — only after the user approves — execute the fixes. Use when the user points at a context-package folder (e.g. ~/Desktop/tsx-dataflow-*-context) and asks to distill the voiceover into work artifacts, write up the feedback, or "do another round of this." Always STOPS after planning for review before any code changes.
argument-hint: "Path to the context-package folder, optionally a run mode: plan-only (default) or execute"
user-invocable: true
disable-model-invocation: false
---

# Feedback Walkthrough → Plan → Execute

The user records a screencast voicing stream-of-consciousness opinions while
clicking through the tsx-dataflow web UI, then drops a **context package** folder
(transcript, frames, audio, `index.md`, `report.html`). This skill turns that
unstructured feedback into durable work artifacts: a detailed, code-grounded
findings document — and, on a separate go-ahead, the implementation.

**This skill runs in two phases with a hard stop between them.** Default to
**plan-only**. Never start editing code in the same pass that produces the plan,
unless the user explicitly said "execute" / "implement everything" / "go execute"
in the invocation.

Prior runs of this exact process produced
`docs/feedback/20260625-web-ui-walkthrough-findings.md` and
`docs/feedback/20260625-web-ui-walkthrough-findings-round2.md`. **Read whichever
exist before starting** — they are the template to mirror and the record of what
was already fixed. The durable product themes are in `INTENT.md` at the repo root.

---

## Phase 1 — PLAN (default; always stop at the end)

### 1. Ingest the context package

The argument is a path to a folder. Expect this layout (see its `index.md`):

```
index.md            duration, source list, screenshot cadence, frame table
report.html         pre-rendered context report (open/WebFetch only if needed)
contact_sheet.jpg   thumbnail grid of all frames
transcript/         transcript.txt (plain), transcript.srt (timestamped), .json
frames/             frame_0001.jpg … one per cadence interval (usually every 10s)
audio/              audio.wav, plus the source .mov
```

- Read `index.md` first (duration, source count, screenshot cadence).
- Read `transcript/transcript.txt` — this is the **primary signal**. Also read
  `transcript/transcript.srt` for timestamps (used to map comments → frames).
- Transcriber quirks: "syncs" almost always means **sinks**; "peram" = query
  param; expect garbled symbol names — recover them from the frames/code.

### 2. Decide whether the video is usable

Frames may be black (a past recording broke when the window moved monitors). Cheap
check: `ls -la frames/` — if every frame is the same tiny size (~22 KB) they are
black; legible frames are ~250–400 KB. Confirm by reading `frame_0001.jpg` and
`frame_0002.jpg`.

- **Black/unusable** → say so in the report header, work from the transcript only,
  and lean harder on Open Questions for anything you can't pin.
- **Legible** → map transcript segments to frames via the SRT: at cadence `C`
  seconds, the comment at time `t` is roughly `frame_{floor(t/C)+1}`. View a
  **strategic spread** (not all of them): one frame per distinct topic/complaint —
  e.g. the sort bug, a file/detail page, an empty/edge state, the panel the user
  is critiquing, each "this feels good / this is broken" beat. Ground every claim
  in a specific frame and cite it.

### 3. Map every comment back to code

Don't just transcribe opinions — confirm them in the source. The web UI surface:

| File | Role |
|------|------|
| `src/server.mjs` | routes, overview page, file-page assembly, per-file scoping |
| `src/html/code-map.mjs` | annotated code map, the right-hand detail/inventory panel, path overlay |
| `src/html/page.mjs` | HTML shell, all CSS, all client JS |
| `src/html/source-peek.mjs` | `path:line` previews / open-file links |
| `src/html/markdown-to-html.mjs` | report-view markdown rendering |
| `src/core.mjs` | the analyzer (8k+ lines): ranking, burden, defenses, junctions, forks, report views, the report object shape |

For anything touching the analyzer's data model, ranking, burden weights, defense
classification, or report-view data shapes, **dispatch parallel exploration
agents** (general-purpose) to map `core.mjs` rather than reading it linearly — it
is large. Pin exact `file:line` for every issue. Verify, don't infer: if the user
says "X is broken," find the line that makes it so (e.g. a column labeled "Worst"
that sorts by `sumBurden`).

### 4. Write the findings document

Write to `docs/feedback/<YYYYMMDD>-<slug>.md` (today's date; derive `<slug>` from
the context folder name, e.g. `tsx-dataflow-postfixes-context` →
`web-ui-walkthrough-findings`). If a prior findings doc exists, this is a
follow-up: add a `-round2` / `-round3` suffix and treat it as such.

Mirror the established structure exactly (the user has said this format is what
they want):

1. **Provenance header** — duration, source count, and explicitly whether the
   video was usable (and that frames are cited if so).
2. **✅ What landed well** — if a follow-up, verify prior fixes against the new
   transcript/frames and list the ones the user confirmed. Records intent and
   guards against regressions.
3. **🎯 Big theme(s)** up front — the dominant, repeated asks, with quotes.
4. **Detailed issues** — give each a stable ID + tag. Tags:
   `[ARCH]` structural · `[UX]` interaction/polish · `[BUG]` broken/inconsistent ·
   `[MODEL]` analyzer/data-model · `[COPY]` wording. Each issue includes:
   - the **verbatim quote** (with transcript line and/or SRT timestamp),
   - the **exact code location** (`file:line`) and what the code does today,
   - the **frame** that shows it (if video is usable),
   - a concrete **suggested fix**.
5. **Priority table** — item / type / effort (trivial → large), with a sensible
   suggested sequence.
6. **Open questions** — decisions that are genuinely the user's to make (scope,
   thresholds, scheme choices) or anything you couldn't pin without more input.

Keep it exhaustive and honest. Cross-reference `INTENT.md` themes where a comment
restates a durable intent.

### 5. STOP and report

Do **not** edit any source. Summarize: the big themes, the count of issues by tag,
2–4 of the most important specifics (with the code locations you confirmed), and
the path to the written doc. Then explicitly hand back: the user reviews and
decides what to execute.

If the user previously asked you to move reports into the repo, you can write
directly into `docs/feedback/` (that is already its home) and just mention it.

---

## Phase 2 — EXECUTE (only on explicit go-ahead)

Trigger only when the user says to implement / execute / "fix everything" — either
in the original invocation (`execute` mode) or in a later message after reviewing
the plan.

1. **Re-read the findings doc** as the source of truth.
2. **TaskCreate** a grouped task list (by file/theme, not one per micro-issue).
   Mark `in_progress`/`completed` as you go.
3. **Implement in priority order**: correctness/bugs first, then UX/polish, then
   architecture. For large `[ARCH]`/`[MODEL]` items, deliver a real working slice
   (e.g. "do repeated-forks end-to-end, then template the rest") rather than a
   shallow stub — and be explicit about what is fully done vs. a documented
   follow-up. Never claim completeness you didn't achieve.
4. **Analyzer changes** (`core.mjs`): tread carefully. Prefer additive fields
   (e.g. a `tier` tag on sinks) over rewiring shared pipelines; favor UI-layer
   fixes when an analyzer change would be risky or noisy, and note the trade-off.
5. **Verify, every time**:
   - Update/extend `test/server.test.mjs` for changed behavior; add coverage for
     new behavior. The harness drives the server handler in-process and asserts on
     HTML — follow the existing patterns.
   - `npx vitest run` must be green.
   - Live smoke test: launch
     `node bin/tsx-dataflow-serve.mjs --port <p> --root examples/bad-ish-solid --source src --tsconfig tsconfig.json`
     (background), `curl` the overview and a file page, grep the served HTML for
     the new markup, and `node --check` the inlined client `<script>` (extract it
     with awk between `<script>`/`</script>`). Kill the server when done.
6. **Report faithfully** — what shipped, what's partial, what's deferred and why.
   Offer to commit; do not commit unless asked.

---

## Conventions & gotchas

- **Default is plan-only.** The stop between planning and executing is a hard
  requirement the user asked for. When unsure which phase, plan and stop.
- Use **today's date** from the environment for the filename; convert any relative
  dates in the feedback to absolute.
- The frames are large binaries — read a *strategic subset*, not all of them.
- `examples/bad-ish-solid` is the local fixture that exercises findings, forks,
  junctions, and usages — use it for live verification. The user's real footage is
  usually from a different repo whose source you won't have; rely on the transcript
  + frames + this repo's code for those references, and log unknowns.
- Skill output lives in `docs/feedback/`; product-direction distillations belong in
  `INTENT.md`. If a round surfaces new durable intents, offer to update `INTENT.md`.
