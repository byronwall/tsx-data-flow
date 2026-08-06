export interface AnalysisCancellationToken {
  throwIfCancelled(): void;
}

export class AnalysisCancelledError extends Error {
  constructor() {
    super("Analysis request was cancelled");
    this.name = "AnalysisCancelledError";
  }
}

export const NO_ANALYSIS_CANCELLATION: AnalysisCancellationToken = {
  throwIfCancelled() {},
};

export function createAnalysisCancellationToken(
  isCancelled: () => boolean,
): AnalysisCancellationToken {
  return {
    throwIfCancelled() {
      if (isCancelled()) throw new AnalysisCancelledError();
    },
  };
}

export function isAnalysisCancelledError(error: unknown): error is AnalysisCancelledError {
  return error instanceof AnalysisCancelledError;
}
