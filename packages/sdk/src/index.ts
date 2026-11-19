export { AgentAuth, decodeAitClaims } from "./agent-auth.js";
export {
  createDelegationHop,
  decodeDelegationHop,
  type CreateDelegationHopOptions,
} from "./delegation.js";
export { TokenExchangeError, isTokenExchangeError } from "./errors.js";
export { exchangeToken, registerAgentPublicKey } from "./exchange.js";
export {
  assertPublicJwk,
  generateAgentKeyPair,
  hasPrivateJwkFields,
  importPrivateKey,
  jwkThumbprint,
  signingAlgOf,
  toPublicJwk,
} from "./keys.js";
export { hopNarrows, isSubset } from "./policy.js";
export {
  createProofJwt,
  publicKeyAudience,
  tokenExchangeAudience,
  tokenExchangeAudiences,
} from "./proof.js";
export {
  AGENTIDP_DELEGATION_TYP,
  AGENTIDP_PROOF_TYP,
  AGENTIDP_TOKEN_TYP,
  AIT_TYP,
  DEFAULT_PROOF_LIFETIME_SECONDS,
  DEFAULT_REGISTRY_URL,
  DEFAULT_TOKEN_LIFETIME_SECONDS,
  MAX_DELEGATION_DEPTH,
  MAX_TOKEN_LIFETIME_SECONDS,
  MIN_TOKEN_LIFETIME_SECONDS,
  PROOF_CLOCK_SKEW_SECONDS,
  PROOF_MAX_LIFETIME_SECONDS,
} from "./types.js";
export type {
  AgentAuthOptions,
  AgentIdpTokenClaims,
  AgentKeyPair,
  AgentSigningAlg,
  AitClaims,
  Confirmation,
  CreateProofJwtOptions,
  DelegationEntry,
  FetchLike,
  GetTokenOptions,
  OwnerType,
  PrivateKeyInput,
  TokenExchangeRequest,
  TokenExchangeResponse,
  VerificationLevel,
  VerificationLevelInput,
} from "./types.js";
