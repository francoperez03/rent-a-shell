// Wallet descartable para el buyer: imprime la address (para fondear) y la secret key base58 (para .env.local).
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder, getBase58Decoder } from "@solana/kit";

const seed = crypto.getRandomValues(new Uint8Array(32));
const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
const secret = new Uint8Array([...seed, ...getAddressEncoder().encode(signer.address)]);
console.log(`address: ${signer.address}`);
console.log(`BUYER_SOLANA_KEY=${getBase58Decoder().decode(secret)}`);
