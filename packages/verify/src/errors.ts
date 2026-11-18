import type { AgentIdErrorBody, AgentIdErrorCode } from "./types.js";

export const ERRORS: Record<
  AgentIdErrorCode,
  { status: number; message: string }
> = {
  "AID-001": {
    status: 401,
    message: "AgentIDP token signature verification failed",
  },
  "AID-002": {
    status: 401,
    message: "AgentIDP token has exceeded its exp claim",
  },
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
  "AID-011": { status: 400, message: "AgentIDP token aud claim is required" },
  "AID-013": { status: 401, message: "Agent proof JWT failed verification" },
  "AID-014": {
    status: 403,
    message: "Requested scope is not a subset of registered capabilities",
  },
  "AID-016": { status: 400, message: "Agent has no registered public key" },
  "AID-017": {
    status: 400,
    message: "public_key is not a supported ES256 or EdDSA public JWK",
  },
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
