import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareSiteAcceptance } from './site-acceptance-prepare.mjs';

const theme = process.argv[2] ?? 'local';
const prepared = prepareSiteAcceptance(theme);
mkdirSync('.playwright-cli', { recursive:true });
if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
for (const [name, argv] of [
  ['typecheck-engine', ['yarn', 'exec', 'tsc', '--', '--noEmit']],
  ['typecheck-me', ['yarn', 'exec', 'tsc', '--', '--noEmit', '-p', '../../local/me/tsconfig.json']],
  ['production', ['yarn', 'build']],
]) {
  const result = spawnSync(argv[0], argv.slice(1), { encoding:'utf8', env:process.env });
  writeFileSync(`/evidence/rework-${name}.log`, (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.stack ?? ''));
  assert.equal(result.status, 0, `${name}: ${result.stdout}\n${result.stderr}`);
}
const manifest = JSON.parse(readFileSync('public/build/theme.json'));
writeFileSync('/evidence/rework-theme-manifest.json', JSON.stringify(manifest, null, 2));
writeFileSync('/evidence/rework-preparation.json', JSON.stringify(prepared, null, 2));
console.log(`Authored=${prepared.authored ?? false}; theme=${theme}: both TypeScript scopes and production build passed.`);
