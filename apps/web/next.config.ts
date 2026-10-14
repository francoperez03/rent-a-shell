import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // monorepo: trace from the repo root so the skills folder ships with the /skills route
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  outputFileTracingIncludes: { '/skills/*': ['../../skills/**/*'] },
};

export default config;
