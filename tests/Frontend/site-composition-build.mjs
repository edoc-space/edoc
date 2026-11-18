import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareSiteCompositionFixture } from './site-composition-fixture.mjs';
import { verifyMdxFingerprints } from './mdx-components-fingerprints.mjs';

const theme = process.argv[2] ?? 'default';
const fixture = prepareSiteCompositionFixture(theme);
writeFileSync('/app/blog-clock.txt', '2026-11-12T12:00:00Z');
if (!existsSync('/app/public')) symlinkSync(resolve('public'), '/app/public');
writeFileSync('/app/blog-test-prepend.php', readFileSync('tests/Support/blog-fpm-prepend.php'));
writeFileSync('public/.user.ini', 'auto_prepend_file=/app/blog-test-prepend.php\n');
function run(command, args, name) {
  const result = spawnSync(command, args, { encoding: 'utf8', env: process.env });
  writeFileSync(`/evidence/${name}.log`, result.stdout + result.stderr);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
run('yarn', ['exec', 'tsc', '--', '--noEmit'], 'composition-tsc');
run('yarn', ['exec', 'tsc', '--', '--noEmit', '-p', '../../local/me/tsconfig.json'], 'composition-me-tsc');
run('yarn', ['build'], 'composition-build');
const manifest = JSON.parse(readFileSync('public/build/theme.json', 'utf8'));
assert.equal(manifest.schemaVersion, 2);
for (const suffix of ['components/Projects.tsx', 'components/projects.ts', 'components/LocalProbe.tsx', 'components/probe.css', '@fixture/mdx-components/index.jsx']) {
  assert(Object.keys(manifest.inputs).some(path => path.endsWith(':' + suffix)), `Fingerprint ${suffix}`);
}
writeFileSync('/evidence/composition-manifest.json', JSON.stringify(manifest, null, 2));
verifyMdxFingerprints(fixture);
writeFileSync('/evidence/composition-fixture.json', JSON.stringify({ theme, site: fixture.site, packageRoot: fixture.packageRoot }, null, 2));
console.log('Production composition build and both TypeScript scopes passed.');
