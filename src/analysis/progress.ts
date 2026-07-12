export type AnalyzerProgressUpdate = {
  step: "program" | "identity" | "trace" | "summarize";
  message: string;
  completed?: number;
  total?: number;
  file?: string;
};

export type AnalyzerProgressReporter = (update: AnalyzerProgressUpdate) => void;
