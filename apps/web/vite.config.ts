import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Plugin } from 'vite';

const gateway = 'http://localhost:8787';
const SKILL_DIR = path.resolve(__dirname, '../../skills/rent-a-shell');

/**
 * What an agent looks for when it is handed the website URL: /llms.txt and /.well-known/agent.json (from the live gateway
 * at build time, with a fixed "Gateway:" line), plus the rent client at /skills/rent/. The build never fails on this.
 */
function agentFiles(apiUrl: string): Plugin {
  const get = (p: string) => fetch(`${apiUrl}${p}`, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const quickStart = `## Quick start for agents (interactive session)

\`\`\`bash
mkdir -p ~/.rent-a-shell && cd ~/.rent-a-shell
curl -fsSL ${'{SITE}'}/skills/rent/rent.mjs -o rent.mjs
echo '{"private":true}' > package.json && npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
node rent.mjs wallet                                   # agent wallet; fund it with USDC on the shell's network (devnet: faucet.circle.com), no SOL needed
node rent.mjs info --gateway ${'{SITE}'}             # spec, price, queue (show the price and ask the person before paying)
node rent.mjs rent --gateway ${'{SITE}'} --blocks 1 --max-usd 0.05
node rent.mjs cmd --joint grip --angle 175             # one command at a time; prints the real angle and peak mA
node rent.mjs frame --out after.jpg · node rent.mjs state · node rent.mjs end
\`\`\`
Skill for Claude Code: ${'{SITE}'}/skills/rent/SKILL.md

`;
  return {
    name: 'rent-a-shell-agent-files',
    apply: 'build',
    async closeBundle() {
      const dist = path.resolve(__dirname, 'dist');
      const site = process.env.VITE_SITE_URL || 'https://rent-a-shell.vercel.app';
      const llms = (await get('/llms.txt')) || '# Rent a Shell\n\n> Real robots by the minute. The live gateway (API, camera, MCP) is at the URL below.\n';
      // title and the "> …" summary stay on top; then the gateway lines, the quick start, and the gateway's own sections
      const [intro, ...rest] = llms.split('\n## ');
      const sections = rest.map((r) => `## ${r}`).join('\n');
      writeFileSync(path.join(dist, 'llms.txt'), `${intro.trim()}\n\nGateway: ${apiUrl}\nMCP: ${apiUrl}/mcp\nTerms: ${site}/terms\n\n${quickStart.replaceAll('{SITE}', site)}${sections}`);
      mkdirSync(path.join(dist, '.well-known'), { recursive: true });
      writeFileSync(path.join(dist, '.well-known', 'agent.json'), (await get('/.well-known/agent.json')) || JSON.stringify({ gateway: apiUrl }));
      mkdirSync(path.join(dist, 'skills', 'rent'), { recursive: true });
      for (const f of ['SKILL.md', 'rent.mjs']) copyFileSync(path.join(SKILL_DIR, f), path.join(dist, 'skills', 'rent', f));
      console.log(`[agent-files] wrote llms.txt, .well-known/agent.json, skills/rent/ in ${dist}`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), agentFiles(loadEnv(mode, __dirname, 'VITE_').VITE_API_URL || gateway)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': gateway,
      '/llms.txt': gateway,
      '/.well-known': gateway,
      '/mcp': gateway,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
}));
