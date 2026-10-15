// Vercel's skills CLI reads skills/*/SKILL.md straight from the repo and copies the whole folder (SKILL.md and rent.mjs).
export const INSTALL = 'npx skills add francoperez03/rent-a-shell --skill rent-a-shell';
/** Creates the agent wallet (~/.rent-a-shell/wallet.json) and prints the address to fund with USDC. Runs inside ~/.rent-a-shell. */
export const WALLET_CMD = 'node rent.mjs wallet';
/** What a person says so the agent creates the wallet itself. */
export const WALLET_SENTENCE = 'Create your Rent a Shell wallet and show me the address so I can fund it with USDC.';
