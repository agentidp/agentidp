import { exportJWK, exportPKCS8, generateKeyPair, type JWK } from "jose";

export interface GeneratedAgentKey {
  privateJwk: JWK;
  publicJwk: JWK;
  pem: string;
  kid: string;
}

export async function generateAgentKey(
  kid = "test-agent-key",
): Promise<GeneratedAgentKey> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  privateJwk.kid = kid;
  privateJwk.alg = "ES256";
  privateJwk.use = "sig";
  publicJwk.kid = kid;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  const pem = await exportPKCS8(privateKey);
  return { privateJwk, publicJwk, pem, kid };
}
