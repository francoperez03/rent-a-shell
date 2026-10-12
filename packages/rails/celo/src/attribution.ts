// ERC-8021: sufijo de atribución en el calldata de toda tx que armemos o pidamos firmar.
// API de @celo/attribution-tags (sdk/README.md): toDataSuffix, withAttribution, codeFromRepo, verifyTx.
import { codeFromRepo, toDataSuffix } from "@celo/attribution-tags";

export function attributionCode(env: Record<string, string | undefined>): string {
  return env.CELO_ATTRIBUTION_CODE || codeFromRepo(env.CELO_ATTRIBUTION_REPO || "francoperez/rent-a-shell");
}

export function dataSuffix(env: Record<string, string | undefined>): `0x${string}` {
  return toDataSuffix(attributionCode(env)) as `0x${string}`;
}
