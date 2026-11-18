# Token-exchange test vectors

[`token-exchange-v0.1.json`](token-exchange-v0.1.json) holds compact JWTs and JWKs for AgentIDP token exchange.

**These keys are TEST ONLY.** They are not production, staging, or registry keys. Do not copy them into a live agent.

Cases:

| Name | Expected |
| --- | --- |
| `valid_proof` | Proof JWT verifies (`iss`/`sub` = agent id, `aud` = token endpoint) |
| `wrong_audience` | `AID-013` |
| `expired_proof` | `AID-013` |
| `replayed_jti` | `AID-010` on the second presentation |
| `scope_outside_capabilities` | `AID-014` |
| `widening_delegation_hop` | `AID-009` |

`minted_token_example` is a registry-signed AgentIDP token with `cnf.jkt`. It does not implement resource-server DPoP.
