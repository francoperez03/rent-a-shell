// Throwaway wallet for the buyer: prints the address (to fund it) and the base58 secret key (for .env.local).
import { createKeyPairSignerFromPrivateKeyBytes, getAddressEncoder, getBase58Decoder } from "@solana/kit";

const seed = crypto.getRandomValues(new Uint8Array(32));
const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
const secret = new Uint8Array([...seed, ...getAddressEncoder().encode(signer.address)]);
console.log(`address: ${signer.address}`);
console.log(`BUYER_SOLANA_KEY=${getBase58Decoder().decode(secret)}`);
