# Design note: AIT minting (v0.2)

| Field | Value |
|-------|-------|
| Status | Design note for review. Not accepted spec text. |
| Target | AgentID Protocol v0.2 |
| Based on | `spec/AGENTID-RFC-v0.1.0.md`, IETF `draft-gudlab-agentid-protocol-00` |
| Registry (private) | `agentidp/registry` as of 2026-03-05: Next.js, `jose`, Prisma, Upstash Redis |

This note names the minting changes for v0.2. It does not replace the v0.1.0 draft. Accepted rules should land in `spec/AGENTID-RFC-v0.2.0.md` after review.

---

## 1. What v0.1 does today

v0.1.0 AIT (`typ: AIT+jwt`, `alg: ES256`) carries `agent_id`, owner claims, `capabilities`, optional `delegation_chain`, `iss`, `sub`, `iat`, `exp`, `jti`. `aud` is RECOMMENDED. Tokens last at most 24 hours. `jti` is required; replay cache is SHOULD.

Two mint stories sit side by side and disagree:

- Spec §3.1.2 / §3.3 / §5.3: registry generates the agent ES256 pair, returns the private JWK once, agent self-signs AITs.
- Spec §4.1 `POST /v1/tokens/exchange` and the registry: owner API-key auth, registry signs the AIT with `RegistryKey`. `audience` is optional. Request `scopes` overwrite `capabilities` with no subset check. `delegation_chain` is unsigned JSON; hops are not verified.

v0.2 picks one mint path: **registry-issued, sender-constrained AITs**. The agent holds its private key. The agent signs a proof, not the AIT. Verifiers check the AIT against registry JWKS and the proof against `cnf.jkt`.

---

## 2. Agent-held keys and proof of possession

The registry MUST NOT generate or store agent private keys. Drop `generateAgentKeyPair()` on `POST /v1/agents` and the `agent_secret` response field.

**Register**

1. Agent generates ES256 locally (`kid` chosen by the agent, unique per key).
2. `GET /v1/challenges` with `{ "use": "register" }` returns `{ "nonce", "exp" }` (nonce TTL 60s, single use).
3. Agent sends `POST /v1/agents` with name, capabilities, public JWK, and a compact JWS (`typ: AIT-POP+jwt`) signed by that private key.

PoP JWT claims:

| Claim | Rule |
|-------|------|
| `nonce` | Exact challenge value |
| `aud` | Registry issuer URL |
| `iat`, `exp` | `exp - iat <= 60` |
| `jti` | Unique; reject reuse |

Registry: import the submitted JWK, verify the JWS, check `nonce` unused and unexpired, store **public** JWK + `kid` only.

**Mint**

`POST /v1/tokens/mint` replaces owner-only `/v1/tokens/exchange` for runtime tokens.

Request: `agent_id`, required `aud`, optional `scope` / `capabilities`, optional `delegation_chain`, PoP JWS over a fresh mint nonce (`use: "mint"`). Same PoP rules as register.

Owner API keys stay for dashboard CRUD. They MUST NOT mint an AIT without the agent PoP.

**Rotate:** `POST /v1/agents/{agent_id}/keys` with PoP from the **new** key plus a second JWS from a still-valid old key (or owner session + new-key PoP if no old key remains). Old and new public keys stay published for the overlap in §8.

Failure: `AID-013` `POP_FAILED`.

---

## 3. Scope subset

Keep registered rights on the agent record as `capabilities: string[]` (`resource:action`, spec §10.1).

The minted AIT uses `scope` (RFC 6749 / 8693 space-delimited string) as the granted set. `capabilities` on the AIT is optional in v0.2. If present it MUST be the same set as `scope`, encoded as an array.

**Check** (`isSubset`):

```
requested = unique strings from the request (split scope on SP, or the capabilities array)
registered = agent.capabilities
accept iff
  every r in requested is an element of registered (exact, case-sensitive UTF-8 match)
  requested has no duplicates
```

No prefix or hierarchy. `calendar:write` is not a subset of `{calendar:read}`. `calendar:*` is a distinct string, not a wildcard, unless a later spec defines one.

If the request omits `scope` and `capabilities`, mint `scope` = all registered capabilities.

If `requested` is empty and was sent explicitly (`scope: ""` or `capabilities: []`), mint an AIT with empty `scope`. Verifiers that require a capability reject with `AID-006`.

Reject with `AID-014` `SCOPE_NOT_SUBSET` when the check fails. The registry current line `capabilities: scopes || agent.capabilities` is a v0.1 bug.

Delegation (below) applies `isSubset` again at each hop and at the token.

---

## 4. Delegation: signed hops that only narrow

v0.1 `delegation_chain` is unsigned `{ principal_type, principal_id, granted_at, scopes, evidence }`. A holder can add hops or widen scopes.

v0.2: each hop is a compact JWS, `typ: AIT-DLG+jwt`, signed by the **delegator**.

Hop claims:

| Claim | Rule |
|-------|------|
| `iss` | Delegator `agent_id` or `owner_id` |
| `sub` | Delegate `agent_id` |
| `aud` | Audience granted to the delegate (string or array) |
| `scope` | Space-delimited granted scopes |
| `iat`, `exp` | Hop lifetime; `exp - iat <= 86400` |
| `jti` | Unique hop id |
| `may_act` | RFC 8693: who may present / exchange this grant (`{ "sub": delegate }`) |

AIT `delegation_chain` is an array of those compact JWS strings, index 0 = original principal, last = grant to the acting agent (`sub` of last hop == AIT `sub`).

**Narrowing** (never widen). For hop `i` vs hop `i-1` (and vs the AIT for the last hop):

| Field | Rule |
|-------|------|
| Scopes | `isSubset(hop[i].scope, hop[i-1].scope)` and `isSubset(AIT.scope, last.scope)` and `isSubset(AIT.scope, registered capabilities of AIT.sub)` |
| Audience | every URI in `hop[i].aud` is in `hop[i-1].aud`; AIT `aud` equals last hop `aud` (set equality after normalizing to a set of strings) |
| Expiry | `hop[i].exp <= hop[i-1].exp` and `AIT.exp <= last.exp` |

**Verify** (registry at mint, every verifier at use):

1. Array length 1..8 (max hops: open question, start at 8).
2. Each element is a JWS; `typ` is `AIT-DLG+jwt`; `alg` is `ES256`.
3. Verify signature with the delegator public key (`iss` is an agent → `/v1/agents/{iss}/public-key`; `iss` is an owner → owner signing key published on the owner record).
4. `sub` of hop `i` equals `iss` of hop `i+1`. Last `sub` equals AIT `sub`.
5. Apply the narrowing table. Fail closed on missing `aud`, `scope`, or `exp` on any hop.
6. Do not accept v0.1 unsigned objects.

Failure: `AID-009` `DELEGATION_INVALID`.

The AIT MAY also carry RFC 8693 `act` as a summary of the last hop (`{ "sub": last.iss }`) for OAuth verifiers that do not walk the chain. `act` is informative. The chain is authoritative.

---

## 5. Audience is required

`aud` is REQUIRED on every AIT. Type: string URI or array of URI strings. At least one element. Registry mint rejects a missing or empty `aud`.

Verifier:

1. Missing / empty / wrong type → `AID-011` `AUDIENCE_MISSING`.
2. Expected audience (the service's own identifier, a URI it publishes) is not an exact match of any `aud` element → `AID-012` `AUDIENCE_MISMATCH`.
3. Compare as URI strings after removing a single trailing slash. No host aliasing, no path prefix match.

v0.1 tokens without `aud` are rejected after the cutoff in §11.

---

## 6. Key binding (sender-constrained)

Every v0.2 AIT MUST include:

```json
"cnf": { "jkt": "<base64url SHA-256 JWK thumbprint of the agent public key>" }
```

(`jkt` per RFC 7638 / RFC 9449.) The thumbprint is of the key that passed mint PoP.

**Default presentation: DPoP (RFC 9449).**

Why DPoP:

- AIT is already a JWT; `jose` is already the registry stack.
- `cnf.jkt` is the same confirmation WIMSE Workload Identity Tokens use.
- Mint-time PoP and use-time PoP share one proof shape.

At the resource: `Authorization: DPoP <AIT>` plus `DPoP` proof JWT. Verify per RFC 9449: proof `htm`/`htu` match the request, proof `ath` binds the AIT, proof `jkt` equals `cnf.jkt`, proof `iat`/`jti` pass §7. Mismatch → `AID-015` `CNF_MISMATCH`. A bare `Authorization: Bearer` AIT with `cnf` present MUST be rejected.

**HTTP Message Signatures (RFC 9421)** is the origin-facing profile, not the default API profile.

IETF Web Bot Auth (`draft-ietf-webbotauth-httpsig-protocol`) signs `@authority` or `@target-uri`, requires `created`, `expires`, `keyid` = JWK thumbprint, `tag` = `web-bot-auth`, and discovers keys via `Signature-Agent`. That is request identity for crawlers and origins. It does not issue an AIT.

Fit: the agent uses **the same key**. `keyid` / `cnf.jkt` are the same thumbprint. Origins that only run Web Bot Auth ignore the AIT. APIs that need owner, capabilities, and delegation require the AIT plus DPoP. A client talking to both sends AIT+DPoP to APIs and RFC 9421 + `Signature-Agent` to origins. Registry agent JWKS MAY be advertised as a Web Bot Auth key directory; that is an operational choice, not a mint rule.

WIMSE's HTTP-signature profile is the same split: credential with `cnf`, proof is either a DPoP-like WPT or RFC 9421.

---

## 7. Replay protection

| Store (Upstash Redis) | Key | TTL | Reject |
|-----------------------|-----|-----|--------|
| AIT `jti` | `ait:jti:{jti}` | `exp - now` (token lifetime remaining) | `AID-010` if `SET NX` fails |
| DPoP proof `jti` | `dpop:jti:{jti}` | 5 minutes | `AID-010` |
| Mint/register nonce | `nonce:{nonce}` | 60s, delete on success | `AID-016` `NONCE_INVALID` |

DPoP `iat` window: accept if `|now - iat| <= 60s`. Reject future `iat` beyond that. Proof `exp`, if present, MUST be `<= iat + 300`.

Mint nonce: single use, bound to `agent_id` + `use`. Replay of the PoP JWS fails the nonce store.

v0.1 registry rate-limits exchange (100/min/agent) but does not record `jti`. Verifiers that cannot reach Redis MAY skip AIT `jti` recording only if lifetime is `<= 300s`; they MUST still enforce DPoP `jti`/`iat`. Say so in the verifier profile.

---

## 8. One key-cache rule

Applies to registry JWKS (`/.well-known/jwks.json`) **and** agent keys (`/v1/agents/{id}/public-key`). Same code path.

| Rule | Value |
|------|-------|
| Positive TTL | 3600s (1 hour). Honour a shorter `Cache-Control` `max-age` from the registry. Ignore a longer one. |
| Kid miss | Refetch that JWKS / agent key **once**. If the `kid` is still absent, fail (`AID-001`). Do not fall back to another key. |
| Refetch rate | At most 1 refetch per `kid` per 10s, and 10 refetches per minute per issuer host. Exceeding that is a hard fail, not a stale-key success. |
| Rotation overlap | Publisher keeps the old key in JWKS / agent key list for 72 hours after the new `kid` is active (spec §6.1). New AITs and new PoP use the new `kid` immediately. Verifiers accept both `kid`s during overlap. |
| Revocation | Agent `status` is not answered by this cache. Status checks stay on `/v1/agents/{id}/status` with their own TTL (RECOMMENDED 60s). A cached public key of a revoked agent MUST still fail the status check. |

This replaces the v0.1 split (24h in §3.1.2 vs 1h in §4.3).

---

## 9. Claim set (v0.2 mint)

Header: `alg=ES256`, `typ=AIT+jwt`, `kid` = **registry** signing key.

Payload (changes from v0.1 in bold):

| Claim | Status | Notes |
|-------|--------|-------|
| `agent_id`, `agent_name`, `owner_id`, `owner_type`, `owner_name`, `verification_level` | REQUIRED | Unchanged |
| `iss` | REQUIRED | Registry URL |
| `sub` | REQUIRED | Equals `agent_id` |
| **`aud`** | **REQUIRED** | §5 |
| `iat`, `exp`, `jti` | REQUIRED | `exp - iat <= 86400`; 3600 RECOMMENDED |
| **`scope`** | **REQUIRED** | Space-delimited; §3 |
| `capabilities` | OPTIONAL | If present, same set as `scope` |
| **`cnf.jkt`** | **REQUIRED** | §6 |
| **`ver`** | **REQUIRED** | `"0.2"` |
| `delegation_chain` | OPTIONAL | Array of AIT-DLG JWS; §4 |
| `act` | OPTIONAL | RFC 8693 actor summary |

Registry `signAIT()` today omits `cnf` and `ver`, and treats `aud` as optional. That is the v0.1 wire format.

---

## 10. Related work (mapping, not a rewrite)

| Spec | Overlap | What we do not copy |
|------|---------|---------------------|
| [RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html) Token Exchange | Mint is an exchange: subject token = agent PoP (+ optional hop chain). Use `scope`, `audience`/`aud`, `act`, `may_act`. `requested_token_type` can be `urn:ietf:params:oauth:token-type:access_token` with AIT profile. | We do not require the full 8693 HTTP form for v0.2; JSON `/v1/tokens/mint` is enough. |
| WIMSE (`draft-ietf-wimse-workload-creds`, WPT, HTTP-sig) | WIT-style JWT + `cnf` + either DPoP-like proof or RFC 9421. | WIMSE identity is a workload URI. AIT also carries owner, `verification_level`, capabilities, signed delegation. |
| AAuth (Hardt) | Same direction: no bearer tokens; possession of a key is the credential. | AAuth has no registry, no owner verification levels, no AIT claim set. |
| Web Bot Auth | RFC 9421 + `Signature-Agent` + `keyid`=jkt. Same key as `cnf.jkt`. | Web Bot Auth is origin request signing. It does not replace AIT mint. |

---

## 11. Threat model (what each control stops)

| Threat | Control |
|--------|---------|
| Registry or operator holds agent private keys; dump or insider mints as any agent | Agent-held keys; registry stores public JWK only |
| Stolen owner API key mints tokens for an offline agent | Mint PoP (nonce JWS) |
| Stolen AIT replayed from another client | `cnf.jkt` + DPoP (or RFC 9421); `AID-015` |
| Stolen AIT replayed by the same client | `jti` store (`AID-010`); DPoP `jti`/`iat`; nonce |
| Agent requests `payment:initiate` when registered for `calendar:read` | `isSubset` at mint (`AID-014`) |
| Delegate widens scopes, audience, or expiry | Signed hops + narrowing table (`AID-009`) |
| Token minted for `https://a.example` sent to `https://b.example` | Required `aud` (`AID-011` / `AID-012`) |
| Forged unsigned `delegation_chain` | Hops are JWS; unsigned objects rejected |
| Stale JWKS after rotation / kid unknown | Kid-miss refetch + 72h overlap + refetch rate limit |
| Revoked agent still accepted via cached key | Status endpoint, not JWKS TTL |

---

## 12. Open questions

1. Max `delegation_chain` length (proposal: 8).
2. Owner signing keys for hop 0 (`principal_type: user`). Separate ES256 per owner, or a registry-signed owner assertion?
3. Dashboard "mint a token" for humans: allowed if the agent signs a mint nonce in-band, or forbidden?
4. Multiple live keys per agent after rotation: one `cnf.jkt` per AIT, but how many published keys? (Proposal: 2 during overlap.)
5. Keep `/v1/tokens/exchange` as an RFC 8693 form, or only `/v1/tokens/mint`?
6. Should `capabilities` stay on the AIT after `scope` exists, or be dropped in v0.3?
7. Exact URI comparison for `aud` (IDNA, default ports). Proposal: no extra normalization beyond one trailing slash.

---

## 13. Test vectors needed

Publish under `spec/vectors/v0.2/` as compact JWS plus expected accept/reject. Pin times. Do not commit private keys used outside the vector set; use documented fixtures.

| ID | Case |
|----|------|
| `pop-reg-ok` / `pop-reg-bad-sig` / `pop-reg-replay-nonce` | Register PoP |
| `pop-mint-ok` / `pop-mint-no-nonce` | Mint PoP |
| `scope-eq` / `scope-strict-sub` / `scope-extra` / `scope-empty-explicit` | Subset check |
| `dlg-2hop-ok` | Two signed hops, each narrower |
| `dlg-widen-scope` / `dlg-widen-aud` / `dlg-later-exp` | Must reject |
| `dlg-unsigned` / `dlg-wrong-signer` / `dlg-sub-mismatch` | Must reject |
| `aud-missing` / `aud-mismatch` / `aud-trailing-slash` | Audience |
| `dpop-ok` / `dpop-replay-jti` / `dpop-iat-old` / `dpop-jkt-mismatch` / `dpop-bearer-rejected` | Key binding |
| `cache-kid-miss-refetch` / `cache-overlap-old-kid` | Key cache |
| `v01-no-cnf` / `v01-no-aud` | Legacy reject after cutoff |

---

## 14. Migration from current tokens

Current tokens: registry-signed `AIT+jwt`, no `cnf`, `aud` optional, `capabilities` may exceed registration, unsigned `delegation_chain`, `jti` prefix `ait_`. Registry still generates `agent_secret`.

| Step | Action |
|------|--------|
| 1 | Ship `/v1/challenges`, `/v1/tokens/mint`, client-key `POST /v1/agents`, `POST /v1/agents/{id}/keys`. Keep `/v1/tokens/exchange` and server-generated keys. |
| 2 | Existing agents upload a client key (`/keys`) and discard `agent_secret`. New agents never receive a private key. |
| 3 | Mint sets `ver=0.2`, `cnf.jkt`, required `aud`, `scope`. Verifiers: if `ver` is `0.2` or `cnf` is present, enforce §5–§7. If `cnf` is absent, treat as v0.1. |
| 4 | After a published cutoff, reject v0.1 at permissioned tiers (`AID-001` with detail `legacy_ait`). Then disable owner-only exchange and server-side keygen. |
| 5 | Unsigned `delegation_chain` is ignored then rejected (`AID-009`). |

No secrets belong in this repository or in vectors beyond documented fixtures.

---

## 15. Registry work (private repo)

When implementing in `agentidp/registry`:

- Delete `generateAgentKeyPair` from `POST /v1/agents`; accept `public_key` + PoP.
- Replace `tokenExchangeSchema.audience` optional with required `aud`; add `isSubset` before `signAIT`.
- Add `cnf`, `ver`, `scope` in `signAIT` / `AITPayload`.
- Persist used `jti` / nonce / DPoP `jti` in the existing Upstash Redis (TTL as §7). Rate limits stay as they are.
- Verify `delegation_chain` JWS hops at mint; stop copying client JSON through.

This repository stays spec text only.
