import { verifyMdxComponents } from './mdx-components-check.mjs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Run after mdx-components-build.mjs in the same production web snapshot.
const calls = [];
function cli(...args) {
  const result = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8' });
  const output = result.stdout + result.stderr;
  calls.push({ args, status: result.status, output });
  writeFileSync('/evidence/pc3-browser-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output);
  assert(!output.includes('### Error'), output);
  return output;
}
const base = process.env.PC3_BASE || 'http://nginx';
try {
  cli('open', `${base}/components`, '--config', '/opt/browser/cli.config.json');
  cli('snapshot');
  cli('run-code', `async page => { const verifyMdxComponents = ${verifyMdxComponents.toString()}; await verifyMdxComponents(page, ${JSON.stringify(base)}, true); }`);
  cli('snapshot');
  cli('console', 'error');
} finally { cli('close'); }
