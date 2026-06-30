export interface CodeMapSink {
  id: string;
  line?: number;
  span?: {
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };
  scores?: {
    burden?: number;
  };
}

export interface CommentRenderState {
  inBlock: boolean;
}

export function dominantSink<T extends CodeMapSink>(sinks: readonly T[]): T;
export function burdenHue(burden: number | null | undefined): number;
export function spanPart(
  sink: CodeMapSink,
  lineNo: number,
): "single" | "start" | "end" | "middle";
export function renderCodeLine(
  text: string,
  lineNo: number,
  lineSinks: readonly CodeMapSink[],
): string;
export function renderCommentLine(
  text: string,
  state: CommentRenderState,
): string;
export function touchedLines(sink: CodeMapSink, maxLine: number): number[];
