import type { AgentIdErrorBody, AgentIdErrorCode } from "./types.js";

export const ERRORS: Record<
  AgentIdErrorCode,
  { status: number; message: string }
> = {
  "AID-001": { status: 401, message: "AIT signature verification failed" },
  "AID-002": { status: 401, message: "AIT has exceeded its exp claim" },
  "AID-003": { status: 403, message: "Agent has been revoked in the registry" },
  "AID-004": { status: 403, message: "Agent is temporarily suspended" },
  "AID-005": {
    status: 403,
    message: "Owner verification level below minimum required",
  },
  "AID-006": {
    status: 403,
    message: "Agent lacks required capability for this action",
  },
  "AID-007": { status: 429, message: "Agent has exceeded per-agent rate limit" },
  "AID-008": {
    status: 403,
    message: "Agent not on service allowlist (permissioned tier)",
  },
  "AID-009": {
    status: 400,
    message: "Delegation chain scope attenuation violated",
  },
  "AID-010": { status: 400, message: "Token jti has been previously used" },
};

export class AgentIdError extends Error {
  readonly code: AgentIdErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: AgentIdErrorCode, detail?: string) {
    const spec = ERRORS[code];
    super(detail ? `${spec.message}: ${detail}` : spec.message);
    this.name = "AgentIdError";
    this.code = code;
    this.status = spec.status;
    this.detail = detail;
  }

  toJSON(): AgentIdErrorBody {
    return {
      error: this.code,
      message: ERRORS[this.code].message,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

export function isAgentIdError(error: unknown): error is AgentIdError {
  return error instanceof AgentIdError;
}
