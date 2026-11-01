import { spawnSync } from 'node:child_process';
import process from 'node:process';
// Preserve local env files. Empty env value is intentional and must survive
// PowerShell 5.1, which removes variables assigned an empty string.
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_PUBLIC_API_BASE_URL: '' },
});
process.exit(result.status ?? 1);
