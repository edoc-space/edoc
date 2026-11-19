import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyRssHttp } from './blog-rss-http.mjs';
import { verifySiteComposition } from './site-composition-check.mjs';
import { verifyCatalog } from './catalog-browser.mjs';
import { verifyMdxComponents } from './mdx-components-check.mjs';
const fixture = JSON.parse(readFileSync('/evidence/composition-fixture.json'));
const base = 'http://nginx';
if (process.argv[2] !== 'ui') await verifyRssHttp({ base, site: fixture.site, clockFile: '/app/blog-clock.txt' });
const calls = [];
function cli(...args) {
  const result = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const output = (result.stdout ?? '') + (result.stderr ?? '') + (result.error?.stack ?? '');
  calls.push({ args, status: result.status, output });
  writeFileSync('/evidence/composition-browser-cli.json', JSON.stringify(calls, null, 2));
  assert.equal(result.status, 0, output); assert(!output.includes('### Error'), output);
}
try {
  cli('open', base, '--config', '/opt/browser/cli.config.json');
  cli('snapshot');
  cli('run-code', `async page => {
    const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
    assert.equal = (actual, expected, message) => assert(Object.is(actual, expected), (message ?? '') + ' expected ' + expected + ', got ' + actual);
    assert.deepEqual = (actual, expected, message) => assert(JSON.stringify(actual) === JSON.stringify(expected), (message ?? '') + ' expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    const verifyCatalog = ${verifyCatalog.toString()};
    const verifyMdxComponents = ${verifyMdxComponents.toString()};
    const verifySiteComposition = ${verifySiteComposition.toString()};
    console.log(JSON.stringify(await verifySiteComposition(page, '${base}')));
  }`);
  cli('snapshot'); cli('console', 'error');
} catch (error) {
  try { cli('snapshot'); cli('run-code', `async page => { await page.screenshot({path:'/evidence/composition-failure.png',fullPage:true}); console.log(await page.locator('body').innerText()); }`); cli('console', 'error'); } catch (captureError) { writeFileSync('/evidence/composition-failure-capture.log', captureError.stack); }
  throw error;
} finally { const closed = spawnSync('/opt/browser/node_modules/.bin/playwright-cli', ['close'], { encoding: 'utf8' }); writeFileSync('/evidence/composition-browser-close.log', (closed.stdout ?? '') + (closed.stderr ?? '') + (closed.error?.stack ?? '')); }
