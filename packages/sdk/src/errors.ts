export class TokenExchangeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: string;

  constructor(code: string, status: number, message: string, detail?: string) {
    super(detail ? `${message}: ${detail}` : message);
    this.name = "TokenExchangeError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function isTokenExchangeError(
  error: unknown,
): error is TokenExchangeError {
  return error instanceof TokenExchangeError;
}
